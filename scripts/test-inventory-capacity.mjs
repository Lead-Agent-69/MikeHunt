import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// No remote targets, user dumps, secrets or existing application database writes.
assert.equal(process.argv.length, 2);
assert.ok(!process.env.DOCKER_HOST, "Remote Docker overrides are not allowed");
const container = "supabase_db_MikeHunt";
const context = execFileSync("docker", ["context", "show"], {
  encoding: "utf8",
}).trim();
const docker = (args, input) =>
  execFileSync("docker", ["--context", context, ...args], {
    input,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
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
const name = `dh_capacity_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
assert.match(name, /^dh_capacity_[a-f0-9]{12}$/);
const query = (database, sql) =>
  docker(
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
let created = false;
try {
  query("postgres", `CREATE DATABASE "${name}" TEMPLATE template0;`);
  created = true;
  query(
    name,
    `CREATE TABLE public.deals(id integer PRIMARY KEY, active boolean, last_seen_at timestamptz);
    INSERT INTO public.deals VALUES (1,true,now()),(2,true,now()-interval '10 days'),(3,false,now()-interval '40 days');
    GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT ON public.deals TO service_role;`,
  );
  query(
    name,
    readFileSync(
      "supabase/migrations/20261028184712_inventory_capacity_report.sql",
      "utf8",
    ),
  );
  const before = query(
    name,
    "SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.deals d;",
  );
  const report = JSON.parse(
    query(
      name,
      "SET ROLE service_role; SELECT public.inventory_capacity_report();",
    ),
  );
  assert.deepEqual(report.inventory, {
    total: 3,
    active: 2,
    unseen30Days: 1,
    unseen7Days: 2,
  });
  assert.deepEqual(report.archive, {
    policyDays: 30,
    actionsEnabled: false,
    eligibilityAssessed: false,
  });
  assert.ok(report.databaseBytes > 0);
  assert.equal(report.relations.length, 1);
  assert.equal(report.relations[0].table_name, "deals");
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () =>
        query(
          name,
          `SET ROLE ${role}; SELECT public.inventory_capacity_report();`,
        ),
      /Command failed/,
    );
  assert.equal(
    query(
      name,
      "SELECT prosecdef FROM pg_proc WHERE oid='public.inventory_capacity_report()'::regprocedure;",
    ),
    "f",
  );
  assert.equal(
    before,
    query(
      name,
      "SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.deals d;",
    ),
  );
  console.log(
    JSON.stringify({
      ok: true,
      scope: "isolated synthetic database",
      readOnlyVerified: true,
      serviceOnlyVerified: true,
      ageCountsVerified: true,
    }),
  );
} finally {
  if (created) query("postgres", `DROP DATABASE "${name}" WITH (FORCE);`);
}
