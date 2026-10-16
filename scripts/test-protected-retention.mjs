import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

// Intentionally no --linked, URL, target or credential arguments.
if (process.argv.length > 2)
  throw new Error("This test accepts no target arguments");
const container = "supabase_db_MikeHunt";
const exec = (args, input) =>
  execFileSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const endpoint = JSON.parse(
  exec(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
);
assert.match(
  endpoint,
  /^(npipe:|unix:)/,
  "Only a local Docker endpoint is allowed",
);
assert.equal(
  exec([
    "inspect",
    container,
    "--format",
    '{{index .Config.Labels "com.supabase.cli.project"}}',
  ]),
  "MikeHunt",
);

const database = `mh_retention_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
assert.match(database, /^mh_retention_test_[a-f0-9]{12}$/);
const args = (db) => [
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
const query = (sql, db = database) =>
  exec(args(db), `SET statement_timeout='12s';\n${sql}`);
const migration = readFileSync(
  "supabase/migrations/20261011142210_protected_inventory_retention.sql",
  "utf8",
);
const regressions = readFileSync(
  "supabase/tests/protected_inventory_retention.sql",
  "utf8",
);
const fixture = readFileSync(
  "supabase/tests/protected-retention-fixture.sql",
  "utf8",
);

// Exercise actual local tables, FKs, grants and pg_cron without retaining changes.
query(
  `BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
${migration}
${regressions}
SET LOCAL ROLE service_role;
SELECT public.inventory_storage_bytes() > 0;
RESET ROLE;
ROLLBACK;`,
  "postgres",
);
console.log(
  "PASS actual local schema: six references, snapshot, bounds, grants and cron replacement (rolled back)",
);

const children = new Set();
function session(sql, singleCommand = false) {
  const command = `SET statement_timeout='12s';\n${sql}`;
  const child = spawn(
    "docker",
    singleCommand ? [...args(database), "-c", command] : args(database),
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  children.add(child);
  let output = "";
  let error = "";
  let marked = false;
  let mark;
  let rejectMark;
  const ready = new Promise((resolve, reject) => {
    mark = resolve;
    rejectMark = reject;
  });
  // Only holders use ready; avoid an unhandled rejection for ordinary clients.
  ready.catch(() => {});
  const timeout = setTimeout(() => child.kill(), 15_000);
  const done = new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => {
      output += data;
      if (!marked && /(?:^|\n)locked\r?\n/.test(output)) {
        marked = true;
        mark();
      }
    });
    child.stderr.on("data", (data) => {
      error += data;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      children.delete(child);
      if (!marked) rejectMark(new Error("Holder ended before its lock marker"));
      resolve({ code, output: output.trim(), error });
    });
  });
  child.stdin.end(singleCommand ? undefined : command);
  return { ready, done };
}
function confirmHolderIsSleeping() {
  assert.equal(
    query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
    WHERE datname=current_database() AND application_name='mh_retention_holder'
      AND state='active' AND wait_event='PgSleep');`),
    "t",
    "Lock must still be held when the contender starts",
  );
}
const owner = randomUUID();
function listing(id) {
  query(`INSERT INTO public.deals(id,source,source_deal_id,source_url,title,year,
    make,model,condition,ask_price,active,last_seen_at)
    VALUES('${id}','independent_dealer','${id}','https://example.invalid/${id}',
      'Lock test',2020,'Test','Test','clean_title',10000,false,'1900-01-01');`);
}
let created = false;
try {
  query(`CREATE DATABASE "${database}";`, "postgres");
  created = true;
  query(`${fixture}\n${migration}`);
  query(`BEGIN; ${regressions}\nROLLBACK;`);
  query(`INSERT INTO auth.users(id,email) VALUES('${owner}','${owner}@example.invalid');
    INSERT INTO public.profiles(id,email) VALUES('${owner}','${owner}@example.invalid');`);

  const serviceCandidate = randomUUID();
  listing(serviceCandidate);
  const serviceResult = JSON.parse(
    query(`SET ROLE service_role;
    SELECT public.prune_inventory_retention(1); RESET ROLE;`),
  );
  assert.equal(serviceResult.deleted, 1);
  assert.equal(
    query(`SELECT count(*) FROM public.deals WHERE id='${serviceCandidate}';`),
    "0",
  );
  console.log(
    "PASS service_role executes invoker cleanup with its explicit minimum table grants",
  );

  for (const mode of ["bounded RPC", "direct delete"]) {
    const id = randomUUID();
    listing(id);
    const holder = session(`SET application_name='mh_retention_holder';
      BEGIN; SET LOCAL statement_timeout='8s';
      INSERT INTO public.saved_cars(user_id,deal_id,snapshot)
        VALUES('${owner}','${id}','{"title":"kept"}');
      SELECT 'locked'; SELECT pg_sleep(3); COMMIT;`);
    await holder.ready;
    confirmHolderIsSleeping();
    const contender = session(
      mode === "bounded RPC"
        ? "SELECT public.prune_inventory_retention(1);"
        : `DELETE FROM public.deals WHERE id='${id}' RETURNING id;`,
    );
    const a = await holder.done;
    const b = await contender.done;
    assert.equal(a.code, 0, a.error);
    assert.equal(b.code, 0, b.error);
    if (mode === "bounded RPC") assert.equal(JSON.parse(b.output).deleted, 0);
    else assert.equal(b.output, "");
    assert.equal(
      query(`SELECT count(*) FROM public.saved_cars s JOIN public.deals d ON d.id=s.deal_id
      WHERE s.user_id='${owner}' AND d.id='${id}' AND s.snapshot->>'title'='kept';`),
      "1",
    );
    console.log(
      `PASS save wins: ${mode} retains the committed reference and snapshot`,
    );
  }

  const id = randomUUID();
  listing(id);
  const holder = session(`SET application_name='mh_retention_holder';
    BEGIN; SET LOCAL statement_timeout='8s';
    SELECT public.prune_inventory_retention(1); SELECT 'locked'; SELECT pg_sleep(3); COMMIT;`);
  await holder.ready;
  confirmHolderIsSleeping();
  const contender =
    session(`INSERT INTO public.saved_cars(user_id,deal_id,snapshot)
    VALUES('${owner}','${id}','{"title":"late"}');`);
  const a = await holder.done;
  const b = await contender.done;
  assert.equal(a.code, 0, a.error);
  assert.notEqual(
    b.code,
    0,
    "A removed listing must not produce a successful save",
  );
  assert.match(b.error, /foreign key constraint/i);
  assert.equal(
    query(`SELECT count(*) FROM public.saved_cars WHERE deal_id='${id}';`),
    "0",
  );
  console.log(
    "PASS prune wins: late save fails its FK instead of claiming success",
  );
  const slowDelete = randomUUID();
  const demoteFirst = randomUUID();
  listing(slowDelete);
  listing(demoteFirst);
  query(`UPDATE public.deals SET active=true,last_seen_at=now()-interval '40 days' WHERE id='${demoteFirst}';
    CREATE FUNCTION public.retention_deadline_probe() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_sleep(0.5); RETURN OLD; END; $$;
    CREATE TRIGGER retention_deadline_probe BEFORE DELETE ON public.deals
      FOR EACH ROW WHEN (OLD.id='${slowDelete}'::uuid) EXECUTE FUNCTION public.retention_deadline_probe();`);
  const scheduled = query(
    "SELECT command FROM cron.job WHERE jobname='cleanup-expired-deals';",
  );
  const bounded = scheduled.replace(
    "statement_timeout = '15s'",
    "statement_timeout = '100ms'",
  );
  assert.notEqual(
    bounded,
    scheduled,
    "Exercise the recorded cron command's pre-statement deadline",
  );
  const timedOut = await session(bounded, true).done;
  assert.notEqual(
    timedOut.code,
    0,
    "Slow cleanup must be canceled at the real statement boundary",
  );
  assert.match(timedOut.error, /statement timeout/i);
  assert.equal(
    query(`SELECT active FROM public.deals WHERE id='${demoteFirst}';`),
    "t",
    "Timeout must roll back demotion performed before the slow deletion",
  );
  assert.equal(
    query(`SELECT count(*) FROM public.deals WHERE id='${slowDelete}';`),
    "1",
  );
  console.log(
    "PASS actual cron-style multi-command deadline cancels cleanup and rolls back prior demotion",
  );
} finally {
  for (const child of children) child.kill();
  if (created) {
    assert.match(database, /^mh_retention_test_[a-f0-9]{12}$/);
    query(`DROP DATABASE "${database}" WITH (FORCE);`, "postgres");
    console.log("PASS disposable locking-test database removed");
  }
}
