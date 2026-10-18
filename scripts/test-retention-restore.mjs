import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Synthetic fixtures only: never accept a hosted target, credentials or user archive.
if (process.argv.length !== 2)
  throw new Error("Local synthetic rehearsal accepts no target arguments");
if (process.env.DOCKER_HOST)
  throw new Error(
    "DOCKER_HOST override is not allowed in local retention tests",
  );
const container = "supabase_db_MikeHunt";
let verifiedContext;
const run = (args, input, binary = false) =>
  execFileSync(
    "docker",
    verifiedContext ? ["--context", verifiedContext, ...args] : args,
    {
      input,
      encoding: binary ? undefined : "utf8",
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
const selectedContext = run(["context", "show"]).trim();
assert.match(
  JSON.parse(
    run([
      "context",
      "inspect",
      selectedContext,
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  ),
  /^(npipe:|unix:)/,
);
verifiedContext = selectedContext;
assert.equal(
  run([
    "inspect",
    container,
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
  ]).trim(),
  "MikeHunt",
);
const token = randomUUID().replaceAll("-", "").slice(0, 12);
const source = `mh_restore_source_${token}`;
const target = `mh_restore_target_${token}`;
const created = [];
const query = (database, sql) =>
  run(
    [
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
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    `SET statement_timeout='15s';\n${sql}`,
  ).trim();
const fixture = readFileSync(
  "supabase/tests/protected-retention-fixture.sql",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20261011142210_protected_inventory_retention.sql",
  "utf8",
);
const regressions = readFileSync(
  "supabase/tests/protected_inventory_retention.sql",
  "utf8",
);
const tables = [
  "auth.users",
  "public.profiles",
  "public.deals",
  "public.saved_cars",
  "public.watchlist",
  "public.inventory",
  "public.deal_outcomes",
  "public.dealer_deals",
  "public.alert_matches",
  "public.source_url_cache",
  "cron.job",
];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const graph = (database) =>
  query(
    database,
    `SELECT jsonb_build_object(${tables.map((table) => `'${table}',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM ${table} r)`).join(",")})::text;`,
  );
try {
  for (const database of [source, target]) {
    assert.match(database, /^mh_restore_(source|target)_[a-f0-9]{12}$/);
    query("postgres", `CREATE DATABASE "${database}";`);
    created.push(database);
  }
  query(source, `BEGIN; ${fixture}\n${migration}\n${regressions}\nCOMMIT;`);
  const before = graph(source);
  const data = JSON.parse(before);
  for (const name of [
    "saved_cars",
    "watchlist",
    "inventory",
    "deal_outcomes",
    "dealer_deals",
    "alert_matches",
  ]) {
    assert.equal(
      data[`public.${name}`].length,
      1,
      `${name} synthetic reference must exist`,
    );
  }
  assert.equal(data["public.saved_cars"][0].snapshot.title, "kept");
  assert.throws(
    () =>
      query(
        source,
        `BEGIN;
    SELECT cron.alter_job(job_id := jobid, active := true) FROM cron.job WHERE jobname='cleanup-expired-deals';
    ${regressions}\nROLLBACK;`,
      ),
    /Retention must remain paused after installation/,
  );
  assert.equal(
    graph(source),
    before,
    "Rejected activation probe must roll back",
  );
  const archive = run(
    [
      "exec",
      container,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      source,
      "--format=custom",
      "--no-owner",
    ],
    undefined,
    true,
  );
  assert.ok(archive.length > 100 && archive.length < 16 * 1024 * 1024);
  const expectedHash = digest(archive);
  const corrupted = Buffer.from(archive);
  corrupted[corrupted.length - 1] ^= 1;
  assert.notEqual(
    digest(corrupted),
    expectedHash,
    "Tampered archive must fail integrity validation before restore",
  );
  assert.equal(digest(archive), expectedHash);
  run(
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      target,
      "--no-owner",
      "--exit-on-error",
      "--single-transaction",
    ],
    archive,
  );
  assert.equal(
    graph(target),
    before,
    "Restored complete synthetic row graph must match exactly",
  );
  query(target, `BEGIN; ${regressions}\nROLLBACK;`);
  assert.equal(
    graph(target),
    before,
    "Verification must not mutate restored evidence",
  );
  const grant = query(
    target,
    "SELECT NOT has_function_privilege('anon','public.prune_inventory_retention(integer)','EXECUTE') AND NOT has_function_privilege('authenticated','public.prune_inventory_retention(integer)','EXECUTE') AND has_function_privilege('service_role','public.prune_inventory_retention(integer)','EXECUTE');",
  );
  assert.equal(
    grant,
    "t",
    "Service-only maintenance grants must survive restore",
  );
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scope:
          "Local synthetic fixture archive/restore ONLY; not production backup, off-device durability, photo preservation or deletion approval",
        ok: true,
        archiveBytes: archive.length,
        archiveSha256: expectedHash,
        rowGraphSha256: digest(before),
        tablesVerified: tables.length,
        protectedReferenceTypes: 6,
        savedSnapshotPreserved: true,
        tamperDetectedBeforeRestore: true,
        restoredProtectionRegressionPassed: true,
        serviceOnlyGrantsPreserved: true,
      },
      null,
      2,
    ),
  );
} finally {
  for (const database of created.reverse()) {
    assert.match(database, /^mh_restore_(source|target)_[a-f0-9]{12}$/);
    query("postgres", `DROP DATABASE "${database}" WITH (FORCE);`);
  }
  console.log("Disposable synthetic source/restore databases removed");
}
