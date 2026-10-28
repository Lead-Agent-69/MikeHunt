import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  savePreferencesAtomically,
  stampConfirmedPreferences,
} from "../lib/preferences/atomic-save";
import { mergePreferencePatch } from "../lib/preferences/merge-patch";
import type { SupabaseClient } from "@supabase/supabase-js";

assert.equal(process.argv.length, 2);
assert.ok(!process.env.DOCKER_HOST, "Remote Docker overrides are not allowed");
const container = "supabase_db_MikeHunt";
const context = execFileSync("docker", ["context", "show"], {
  encoding: "utf8",
}).trim();
const docker = (args: string[], input?: string) =>
  execFileSync("docker", ["--context", context, ...args], {
    input,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
assert.match(
  JSON.parse(
    docker([
      "context",
      "inspect",
      context,
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  ),
  /^(npipe:|unix:)/,
);
assert.equal(
  docker([
    "inspect",
    container,
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
  ]).trim(),
  "MikeHunt",
);
const name = `dh_prefs_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
assert.match(name, /^dh_prefs_[a-f0-9]{12}$/);
const args = (db: string) => [
  "--context",
  context,
  "exec",
  "-i",
  container,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-U",
  "postgres",
  "-d",
  db,
  "-v",
  "ON_ERROR_STOP=1",
];
const query = (db: string, sql: string) =>
  execFileSync("docker", args(db), {
    input: `SET statement_timeout='15s';\n${sql}`,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
const queryAsync = (sql: string, signal?: AbortSignal) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(
      "docker",
      args(name),
      { encoding: "utf8", timeout: 30000, windowsHide: true, signal },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
    child.stdin!.end(
      `SET statement_timeout='15s'; SET ROLE service_role;\n${sql}`,
    );
  });
const literal = (value: unknown) =>
  value === null
    ? "NULL"
    : `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
const owner = randomUUID(),
  other = randomUUID(),
  fresh = randomUUID();
const uuid = (value: string) => {
  assert.match(value, /^[0-9a-f-]{36}$/);
  return `'${value}'::uuid`;
};
let conflicts = 0;
/** A thin transport to real PostgreSQL, not an in-memory model of CAS behavior. */
function client() {
  let initialReads = 0;
  let unblock!: () => void;
  const bothRead = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  return {
    from(table: string) {
      assert.equal(table, "user_preferences");
      return {
        select: () => ({
          eq: (_column: string, userId: string) => {
            let signal: AbortSignal;
            const reader = {
              abortSignal(value: AbortSignal) {
                signal = value;
                return reader;
              },
              async maybeSingle() {
                const raw = await queryAsync(
                  `SELECT coalesce((SELECT to_jsonb(p) FROM public.user_preferences p WHERE user_id=${uuid(userId)}),'null'::jsonb);`,
                  signal,
                );
                if (initialReads < 2) {
                  initialReads++;
                  if (initialReads === 2) unblock();
                  await bothRead;
                }
                return { data: JSON.parse(raw), error: null };
              },
            };
            return reader;
          },
        }),
      };
    },
    rpc(
      fn: string,
      input: {
        p_user_id: string;
        p_expected_prefs: object | null;
        p_next_prefs: object;
      },
    ) {
      assert.equal(fn, "compare_and_set_user_preferences");
      return {
        async abortSignal(signal: AbortSignal) {
          const raw = await queryAsync(
            `SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.compare_and_set_user_preferences(${uuid(input.p_user_id)},${literal(input.p_expected_prefs)},${literal(input.p_next_prefs)}) r;`,
            signal,
          );
          const data = JSON.parse(raw);
          if (!data.length) conflicts++;
          return { data, error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
}
async function main() {
  let created = false;
  try {
    query("postgres", `CREATE DATABASE "${name}" TEMPLATE template0;`);
    created = true;
    query(
      name,
      `CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES (${uuid(owner)}),(${uuid(other)}),(${uuid(fresh)});
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.user_preferences(user_id uuid PRIMARY KEY REFERENCES auth.users(id),prefs jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_preferences ON public.user_preferences TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
    GRANT USAGE ON SCHEMA public,auth TO service_role,authenticated,anon;
    GRANT SELECT,INSERT,UPDATE ON public.user_preferences TO service_role,authenticated,anon;
    INSERT INTO public.user_preferences(user_id,prefs) VALUES (${uuid(owner)},'{"theme":"light","buyerScope":{"make":"Honda"},"freeWorkspace":{"notes":["keep me"]}}'),(${uuid(other)},'{"private":"untouched"}');`,
    );
    query(
      name,
      readFileSync(
        "supabase/migrations/20261028203228_atomic_owner_preferences.sql",
        "utf8",
      ),
    );
    const transport = client();
    await Promise.all([
      savePreferencesAtomically(transport, owner, (prefs) =>
        mergePreferencePatch(prefs, { theme: "dark" }),
      ),
      savePreferencesAtomically(transport, owner, (prefs) =>
        mergePreferencePatch(prefs, { buyerScope: { model: "Accord" } }),
      ),
    ]);
    const persisted = JSON.parse(
      query(
        name,
        `SELECT prefs FROM public.user_preferences WHERE user_id=${uuid(owner)};`,
      ),
    );
    assert.deepEqual(persisted, {
      theme: "dark",
      buyerScope: { make: "Honda", model: "Accord" },
      freeWorkspace: { notes: ["keep me"] },
    });
    assert.ok(
      conflicts >= 1,
      "A deliberately stale writer must conflict and retry",
    );
    assert.deepEqual(
      JSON.parse(
        query(
          name,
          `SELECT prefs FROM public.user_preferences WHERE user_id=${uuid(other)};`,
        ),
      ),
      { private: "untouched" },
    );
    const freshTransport = client();
    await Promise.all([
      savePreferencesAtomically(freshTransport, fresh, (prefs) => ({
        ...prefs,
        appearance: "dark",
      })),
      savePreferencesAtomically(freshTransport, fresh, (prefs) => ({
        ...prefs,
        homeLocation: { state: "MO" },
      })),
    ]);
    assert.deepEqual(
      JSON.parse(
        query(
          name,
          `SELECT prefs FROM public.user_preferences WHERE user_id=${uuid(fresh)};`,
        ),
      ),
      { appearance: "dark", homeLocation: { state: "MO" } },
    );
    query(
      name,
      `UPDATE public.user_preferences SET prefs=prefs || '{"homeLocation":{"state":"TX"}}' WHERE user_id=${uuid(owner)};`,
    );
    await stampConfirmedPreferences(transport, owner, persisted, {
      locationDemandAt: "2026-10-28T00:00:00Z",
    });
    const afterStamp = JSON.parse(
      query(
        name,
        `SELECT prefs FROM public.user_preferences WHERE user_id=${uuid(owner)};`,
      ),
    );
    assert.equal(afterStamp.homeLocation.state, "TX");
    assert.equal(afterStamp.locationDemandAt, undefined);
    for (const role of ["anon", "authenticated"])
      assert.throws(() =>
        query(
          name,
          `SET ROLE ${role}; SELECT public.compare_and_set_user_preferences(${uuid(owner)},NULL,'{}');`,
        ),
      );
    const visible = query(
      name,
      `SET ROLE authenticated; SET request.jwt.claim.sub='${owner}'; SELECT count(*) FROM public.user_preferences WHERE user_id=${uuid(other)};`,
    );
    assert.equal(visible, "0");
    assert.equal(
      query(
        name,
        `SELECT prosecdef FROM pg_proc WHERE oid='public.compare_and_set_user_preferences(uuid,jsonb,jsonb)'::regprocedure;`,
      ),
      "f",
    );
    console.log(
      JSON.stringify({
        ok: true,
        scope: "isolated synthetic database",
        concurrentUpdatesPreserved: true,
        concurrentFirstSavePreserved: true,
        protectedNotesPreserved: true,
        staleDemandStampRejected: true,
        serviceOnly: true,
        otherOwnerUnchanged: true,
        conflictsObserved: conflicts,
      }),
    );
  } finally {
    if (created) query("postgres", `DROP DATABASE "${name}" WITH (FORCE);`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
