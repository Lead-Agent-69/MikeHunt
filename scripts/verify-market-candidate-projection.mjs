// Isolated Docker PostgreSQL/PostgREST verification. Never reads production credentials.
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const name = "dh-market-json-verify-" + process.pid;
const db = name + "-db",
  api = name + "-api";
const relay = name + "-relay";
const port = Number(process.env.MARKET_PROJECTION_LOCAL_PORT || 55442);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid local port");
const secret = "local-market-projection-verification-secret-only";
const run = (args, options = {}) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
const sql = (text) =>
  run(
    [
      "exec",
      "-i",
      db,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: text },
  );
const legacy = fs
  .readFileSync("supabase/tests/market-candidate-legacy-select.txt", "utf8")
  .trim();
const columns = legacy.split(",").map((field) => field.trim());
const projected = columns.map((field) => field.split(":")[0]).join(",");
const oldSelect = columns
  .map((field) => {
    const [alias, expression] = field.split(":");
    return expression
      ? "d." +
          expression.replace(
            /(->>?)(\w+)/g,
            (_m, arrow, key) => arrow + "'" + key + "'",
          ) +
          " as " +
          alias
      : "d." + alias;
  })
  .join(",");
const schema = fs
  .readFileSync("types/supabase.ts", "utf8")
  .match(/\n      deals: \{\s*Row: \{([\s\S]*?)\n        \}/)[1]
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    const [, column, type] = line.trim().match(/^(\w+): (.+)$/);
    const sqlType =
      column === "id"
        ? "uuid primary key"
        : type.includes("Json")
          ? "jsonb"
          : type.includes("string[]")
            ? "text[]"
            : type.includes("number")
              ? "double precision"
              : type.includes("boolean")
                ? "boolean"
                : column.endsWith("_at")
                  ? "timestamptz"
                  : "text";
    return column + " " + sqlType;
  })
  .join(",");
const stamp = new Date().toISOString();
const uuid = (i) => "00000000-0000-4000-8000-" + String(i).padStart(12, "0");
const rows = Array.from({ length: 520 }, (_, offset) => {
  const i = offset + 1;
  const padding = Array.from({ length: 256 }, (_, j) =>
    crypto
      .createHash("sha256")
      .update(i + ":" + j)
      .digest("hex"),
  ).join("");
  const price =
    i % 17 === 0 ? 299 : i % 19 === 0 ? 500 : i % 43 === 0 ? 0 : 10000 + i;
  const source = i % 41 === 0 ? "copart" : "independent_dealer";
  return {
    id: uuid(i),
    active: i % 59 !== 0,
    dealer_id: i % 2 ? uuid(9001) : uuid(9002),
    source,
    source_deal_id: String(i),
    source_url: "https://dealer.test/car/" + i,
    title: i % 37 === 0 ? "2020 Ford Escape" : "2020 Ford Ranger",
    year: 2020,
    make: i % 31 === 0 ? "CFMOTO" : "Ford",
    model: i % 31 === 0 ? "UFORCE" : "Ranger",
    trim: "XLT",
    vin: "1FTEXAMPLE" + String(i).padStart(7, "0"),
    body_class: "Pickup",
    fuel_type: "Gasoline",
    transmission: "Automatic",
    drivetrain: "AWD",
    color: "Blue",
    assembly_country: "United States",
    availability_status: "on_lot",
    condition: "clean_title",
    damage_type: i % 47 === 0 ? "front end damage" : null,
    location_city: "St Louis",
    location_state: i % 3 === 0 ? "TX" : i % 2 ? "MO" : "FL",
    location_zip: "63101",
    lat: 38.63,
    lng: -90.2,
    mileage: i % 29 === 0 ? null : 32000 + i,
    keys_present: true,
    run_drive: true,
    ask_price: price,
    buy_now_price: source === "copart" ? 14000 : null,
    images:
      i % 11 === 0
        ? ["https://dealer.test/logo.png"]
        : [
            "https://dealer.test/logo.png",
            "https://dealer.test/car-" + i + ".jpg",
          ],
    last_seen_at: stamp,
    first_seen_at: stamp,
    created_at: stamp,
    updated_at: stamp,
    auction_end_at:
      source === "copart"
        ? new Date(Date.now() + 86400000).toISOString()
        : null,
    sell_estimate: 17000,
    true_net_profit: 2500,
    profit_score: 80,
    recommended_max_bid: 11000,
    deal_verdict: "go",
    options:
      i > 500
        ? [null, true, 42, [], "not an object"][i % 5]
        : {
            description:
              i % 17 === 0
                ? "$299 per month"
                : i % 19 === 0
                  ? "Down payment $500"
                  : i % 23 === 0
                    ? "Cash price $12,000"
                    : "",
            priceEvidence: {
              kind: source === "copart" ? "current_bid" : "asking",
              askingPrice: price,
              currentBid: price,
            },
            sellerType: "dealer",
            listingTitle: "2020 Ford Ranger",
            titleSource: "listing",
            fuelType: "Gas",
            transmission: "Automatic",
            drivetrain: "AWD",
            price_is_acv_estimate: i % 67 === 0 ? true : false,
            sourceAvailability: {
              state: i % 53 === 0 ? "removed" : "available",
            },
            photoAudit: {
              state: i % 13 === 0 ? "unavailable" : "unknown",
              placeholderUrls: ["https://dealer.test/logo.png"],
            },
            privateNotes: "private-options-sentinel",
            padding,
          },
    deal_analysis:
      i > 500
        ? [null, [], 42, "bad", false][i % 5]
        : {
            valuation: {
              source: "comparables",
              resaleEvidence: true,
              compCount: 8,
              confidence: "medium",
              compKind: i % 5 === 0 ? "sold" : "ask",
              soldLane: "clean",
              soldAnchored: i % 5 === 0,
              soldCount: i % 5 === 0 ? 3 : 0,
              soldAt: new Date(Date.now() - 86400000).toISOString(),
            },
            evidenceGates: {
              priceMeaningConfirmed: true,
              titleReviewed: true,
              conditionInspected: true,
              costsConfirmed: i % 7 === 0 ? "true" : i % 11 !== 0,
            },
            acquisitionPriceMissing:
              i % 71 === 0 ? true : i % 73 === 0 ? "true" : false,
            priceImplausible: i % 79 === 0 ? true : false,
            roi: i % 83 === 0 ? "20" : 20,
            privateNotes: "private-analysis-sentinel",
            padding,
          },
  };
});
const wait = async (check) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw Error("Local service did not become ready");
};
const plan = (query) =>
  JSON.parse(sql("explain(analyze,buffers,verbose,format json) " + query))[0];
let success = false;
try {
  run(["network", "create", name]);
  run([
    "run",
    "-d",
    "--name",
    db,
    "--network",
    name,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "--mount",
    "type=bind,source=" + root + ",target=/workspace,readonly",
    "postgres:17-bookworm",
  ]);
  await wait(() =>
    run(["exec", db, "pg_isready", "-U", "postgres"]).includes("accepting"),
  );
  sql(
    "create role anon; create role authenticated; create role service_role bypassrls; create role authenticator login noinherit; grant anon,authenticated,service_role to authenticator;" +
      "create table public.deals (" +
      schema +
      "); alter table public.deals enable row level security;" +
      "create policy active_listings on public.deals for select using(active); grant usage on schema public to anon,authenticated,service_role;" +
      "grant select on public.deals to service_role;",
  );
  const grants = fs.readFileSync(
    "supabase/migrations/20261010020000_deals_column_grants.sql",
    "utf8",
  );
  sql(
    grants.slice(grants.indexOf("REVOKE SELECT ON"), grants.indexOf("-- 2)")),
  );
  sql(
    "insert into public.deals select * from jsonb_populate_recordset(null::public.deals,$fixture$" +
      JSON.stringify(rows) +
      "$fixture$::jsonb); analyze public.deals;",
  );
  // Supabase installations may grant broad privileges to new public relations.
  // Prove the migration removes those inherited ACLs, including service writes.
  sql(
    "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;",
  );
  run([
    "exec",
    db,
    "psql",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "/workspace/supabase/migrations/20261105094153_market_candidate_projection.sql",
  ]);
  sql(
    fs.readFileSync("supabase/tests/market_candidate_projection.sql", "utf8"),
  );
  const where =
    " where active and location_state in ('MO','FL') and last_seen_at between now()-interval '30 days' and now() order by id asc limit 500";
  const variants = {
    original: "select " + oldSelect + " from public.deals d" + where,
    projected:
      "select " +
      projected +
      " from public.market_candidate_projection" +
      where,
  };
  const plans = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    for (const [kind, query] of Object.entries(variants)) {
      const result = plan(query);
      plans.push({
        kind,
        iteration,
        executionMs: result["Execution Time"],
        plan: result.Plan,
      });
    }
  }
  // Compare the complete selected records, not just row counts.
  const parity = sql(
    "with original as (select " +
      oldSelect +
      " from public.deals d), projected as (select " +
      projected +
      " from public.market_candidate_projection) select count(*) from original o full join projected p using(id) where to_jsonb(o) is distinct from to_jsonb(p);",
  ).trim();
  if (parity !== "0") throw Error("SQL record parity failed: " + parity);
  run([
    "run",
    "-d",
    "--name",
    api,
    "--network",
    name,
    "-e",
    "PGRST_DB_URI=postgres://authenticator@" + db + ":5432/postgres",
    "-e",
    "PGRST_DB_SCHEMAS=public",
    "-e",
    "PGRST_DB_ANON_ROLE=anon",
    "-e",
    "PGRST_JWT_SECRET=" + secret,
    "public.ecr.aws/supabase/postgrest:v16.2",
  ]);
  // Docker Desktop loopback forwarding is unavailable on some Windows runners.
  // Keep REST traffic inside this disposable network rather than expose a host port.
  run([
    "run",
    "-d",
    "--name",
    relay,
    "--network",
    name,
    "node:24-bookworm-slim",
    "node",
    "-e",
    "setInterval(()=>{},10000)",
  ]);
  const internalUrl = "http://" + api + ":3000";
  await wait(
    () =>
      run([
        "exec",
        relay,
        "node",
        "-e",
        "fetch(process.argv[1]).then(r=>console.log(r.status)).catch(()=>process.exit(1))",
        internalUrl + "/",
      ]).trim() === "200",
  );
  const test = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "app/api/market/explore/projection.integration.test.ts",
      "lib/market/candidate-projection.test.ts",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        MARKET_PROJECTION_TEST_URL: "http://127.0.0.1:" + port,
        MARKET_PROJECTION_TEST_RELAY: relay,
        MARKET_PROJECTION_TEST_INTERNAL_URL: internalUrl,
      },
    },
  );
  if (test.status !== 0)
    throw Error("Local SQL/REST route verification failed");
  const report = {
    database: "isolated PostgreSQL 17",
    fixtureRows: rows.length,
    source: "synthetic toasted JSON, not production data",
    sqlRecordMismatches: 0,
    plans,
  };
  fs.mkdirSync("artifacts/market-candidate-projection", { recursive: true });
  fs.writeFileSync(
    "artifacts/market-candidate-projection/verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      sqlRecordMismatches: 0,
      timings: plans.map(({ kind, iteration, executionMs }) => ({
        kind,
        iteration,
        executionMs,
      })),
    }),
  );
  success = true;
} finally {
  for (const container of [relay, api, db]) {
    try {
      run(["rm", "-f", "-v", container]);
    } catch {}
  }
  try {
    run(["network", "rm", name]);
  } catch {}
  if (!success) process.exitCode = 1;
}
