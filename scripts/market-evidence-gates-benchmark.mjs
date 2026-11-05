// Called only by the disposable Docker verification wrapper. No hosted credentials.
import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
const fullScope =
  " where v.active = true\n  and v.location_state in ('MO','FL')\n  and v.last_seen_at >= '$observed_after$'::timestamptz\n  and v.last_seen_at <= '$observed_at$'::timestamptz\n  and (v.title is null or v.title !~* '^[[:space:]]*(check out (these|our) (great )?deals|browse (our )?(inventory|vehicles)|shop (our )?(inventory|vehicles)|view (all |our )?inventory)[[:space:]!.]*$')\n  and (v.source_url is null or v.source_url !~* '[/]searchnew[.]aspx([?]|$)')\n  and (v.auction_end_at is null or v.auction_end_at > '$observed_at$'::timestamptz)\n  and (v.condition is null or v.condition in ('clean_title','run_drive'))\n  and (v.damage_type is null or v.damage_type ilike '' or v.damage_type ilike 'none' or v.damage_type ilike 'unknown' or v.damage_type ilike 'n/a' or v.damage_type ilike 'na' or v.damage_type ilike 'not reported' or v.damage_type ilike 'no damage')\n  and (v.title is null or v.title !~* '\\y(?:mechanic(?:[''’]s|s)?[\\s-]+special|(?:restoration|repair)[\\s-]+project|parts[\\s-]+only|non[\\s-]+runner|not[\\s-]+running|does(?:n''t|[\\s]+not)[\\s]+run|needs[\\s]+(?:repairs?|(?:an?[\\s]+)?(?:engine|transmission)))\\y')\n  and v.images is not null\n  and v.images <> '{}'::text[]\n  and (v.options->'sourceAvailability'->>'state' is null or v.options->'sourceAvailability'->>'state' <> 'removed')\n  and (v.options->'photoAudit'->>'state' is null or v.options->'photoAudit'->>'state' <> 'unavailable')";
export function benchmarkEvidenceGates({ sql, stamp }) {
  const folder = "test-results/market-evidence-gates";
  fs.mkdirSync(folder, { recursive: true });
  const metadata = () =>
    JSON.parse(
      sql(
        `select json_build_object('columns',(select json_agg(json_build_array(attname,atttypid) order by attnum) from pg_attribute where attrelid='public.market_candidate_projection'::regclass and attnum>0 and not attisdropped),'options',(select reloptions from pg_class where oid='public.market_candidate_projection'::regclass),'acl',(select relacl::text from pg_class where oid='public.market_candidate_projection'::regclass),'rls',(select json_build_array(relrowsecurity,relforcerowsecurity) from pg_class where oid='public.deals'::regclass),'policies',(select json_agg(row_to_json(p)) from pg_policies p where schemaname='public' and tablename='deals'));`,
      ),
    );
  const before = metadata();
  sql(
    fs
      .readFileSync(
        "supabase/migrations/20261105155012_market_candidate_evidence_gates.sql",
        "utf8",
      )
      .replace(/^\uFEFF/, ""),
  );
  const after = metadata();
  assert.deepEqual(after.columns.slice(0, -1), before.columns);
  assert.deepEqual(after.columns.at(-1), ["evidence_gates", "3802"]);
  for (const key of ["options", "acl", "rls", "policies"])
    assert.deepEqual(after[key], before[key]);
  sql(
    fs
      .readFileSync(
        "supabase/migrations/20261105094153_market_candidate_projection.sql",
        "utf8",
      )
      .replace(/^\uFEFF/, "")
      .replaceAll(
        "public.market_candidate_projection",
        "public.market_candidate_projection_raw",
      ),
  );
  const fields = fs
    .readFileSync("lib/market/candidate-projection.ts", "utf8")
    .match(/^  "([^"\n]+)",?$/gm)
    .map((line) => JSON.parse(line.trim().replace(/,$/, "")));
  assert.ok(fields.includes("evidence_gates"));
  assert.ok(fields.every((f) => !f.includes("->")));
  const where = fullScope
    .replaceAll(
      "$observed_after$",
      new Date(Date.parse(stamp) - 30 * 86400000).toISOString(),
    )
    .replaceAll("$observed_at$", stamp);
  const select = (kind) =>
    fields
      .map((f) =>
        f === "evidence_gates"
          ? kind === "raw"
            ? "v.deal_analysis->'evidenceGates' as evidence_gates"
            : "v.evidence_gates"
          : "v." + f,
      )
      .join(",");
  const queries = Object.fromEntries(
    ["raw", "view"].map((kind) => [
      kind,
      "select " +
        select(kind) +
        " from public.market_candidate_projection" +
        (kind === "raw" ? "_raw" : "") +
        " v" +
        where +
        " order by v.id asc limit 500",
    ]),
  );
  const mismatches = Number(
    sql(
      "select count(*) from (" +
        queries.raw.replace("limit 500", "limit 10000") +
        ") r full join (" +
        queries.view.replace("limit 500", "limit 10000") +
        ") v using(id) where to_jsonb(r) is distinct from to_jsonb(v);",
    ).trim(),
  );
  assert.equal(mismatches, 0);
  const ids = JSON.parse(
    sql(
      "select json_agg(t.id) from (" +
        queries.view.replace("limit 500", "limit 10000") +
        ") t;",
    ),
  );
  const cursors = ["", ...ids.filter((_, i) => (i + 1) % 500 === 0)];
  if (ids.length % 500) cursors.push(ids.at(-1));
  let input =
    "set role service_role; set statement_timeout='45s';\n\\timing on\n";
  for (let round = 0; round < 8; round++)
    for (const kind of round % 2 ? ["view", "raw"] : ["raw", "view"])
      for (const mode of ["rows", "serialized"]) {
        const q =
          mode === "rows"
            ? queries[kind]
            : "select json_agg(t) from (" + queries[kind] + ") t";
        input += `\\echo PLAN|${round}|${kind}|${mode}\nexplain(analyze,buffers,verbose,summary,format json) ${q};\n`;
      }
  for (let round = 0; round < 12; round++)
    for (const kind of round % 2 ? ["view", "raw"] : ["raw", "view"])
      for (let batch = 0; batch < cursors.length; batch++) {
        const cursor = cursors[batch];
        const q = queries[kind].replace(
          " order by ",
          (cursor ? ` and v.id>'${cursor}'::uuid` : "") + " order by ",
        );
        input += `\\echo BATCH|${round}|${kind}|${batch}\nselect coalesce(json_agg(t),'[]'::json) from (${q}) t;\n`;
      }
  fs.writeFileSync(folder + "/controlled-benchmark.sql", input);
  const output = sql(input);
  fs.writeFileSync(folder + "/batch-output.txt", output);
  const blocks = output
    .split(/(?=^(?:PLAN|BATCH)\|)/m)
    .filter((s) => /^(?:PLAN|BATCH)\|/.test(s));
  const plans = [],
    batchRuns = new Map();
  for (const block of blocks) {
    const [line, ...bodyLines] = block.trim().split(/\r?\n/);
    const [type, round, kind, mode] = line.split("|");
    const body = bodyLines.join("\n");
    const parsed = JSON.parse(
      body.slice(body.indexOf("["), body.lastIndexOf("]") + 1),
    );
    if (type === "PLAN") {
      const p = parsed[0];
      plans.push({
        round: Number(round),
        kind,
        mode,
        executionMs: p["Execution Time"],
        plan: p,
      });
    } else {
      const key = round + "|" + kind;
      if (!batchRuns.has(key))
        batchRuns.set(key, {
          round: Number(round),
          kind,
          rows: 0,
          ms: 0,
          bytes: 0,
          parts: [],
          hash: crypto.createHash("sha256"),
        });
      const run = batchRuns.get(key);
      const ms = Number(body.match(/Time:\s+([\d.]+)\s+ms/)[1]);
      const payload = JSON.stringify(parsed);
      run.hash.update(payload);
      run.bytes += Buffer.byteLength(payload);
      run.rows += parsed.length;
      run.ms += ms;
      run.parts.push({ rows: parsed.length, ms });
    }
  }
  const batches = [...batchRuns.values()].map(({ hash, ...b }) => ({
    ...b,
    sha256: hash.digest("hex"),
  }));
  assert.ok(
    batches.every(
      (b) => b.rows === ids.length && b.sha256 === batches[0].sha256,
    ),
  );
  const median = (xs) => {
    const a = [...xs].sort((x, y) => x - y);
    return a.length % 2
      ? a[(a.length - 1) / 2]
      : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
  };
  const summary = {};
  for (const mode of ["rows", "serialized"]) {
    const raw = median(
      plans
        .filter((p) => p.kind === "raw" && p.mode === mode)
        .map((p) => p.executionMs),
    );
    const view = median(
      plans
        .filter((p) => p.kind === "view" && p.mode === mode)
        .map((p) => p.executionMs),
    );
    summary[mode] = {
      rawMs: raw,
      viewMs: view,
      improvementPct: (100 * (raw - view)) / raw,
      viewWinsOf8: Array.from({ length: 8 }, (_, round) => {
        const pair = plans.filter((p) => p.round === round && p.mode === mode);
        return (
          pair.find((p) => p.kind === "view").executionMs <
          pair.find((p) => p.kind === "raw").executionMs
        );
      }).filter(Boolean).length,
    };
  }
  const raw = median(batches.filter((p) => p.kind === "raw").map((p) => p.ms));
  const view = median(
    batches.filter((p) => p.kind === "view").map((p) => p.ms),
  );
  summary.fullSerializedScan = {
    rawMs: raw,
    viewMs: view,
    improvementPct: (100 * (raw - view)) / raw,
    viewWinsOf12: Array.from(
      { length: 12 },
      (_, r) =>
        batches.find((b) => b.round === r && b.kind === "view").ms <
        batches.find((b) => b.round === r && b.kind === "raw").ms,
    ).filter(Boolean).length,
  };
  const storage = JSON.parse(
    sql(
      "select json_build_object('rows',count(*),'analysis_avg_bytes',avg(pg_column_size(deal_analysis)),'options_avg_bytes',avg(pg_column_size(options)),'table_bytes',pg_total_relation_size('public.deals')) from public.deals;",
    ),
  );
  const result = {
    database: sql("show server_version;").trim(),
    method:
      "Unchanged original view raw alias versus appended candidate; persistent psql connection; service_role; balanced AB/BA; synthetic warm-cache only, no production latency claim.",
    fullRecordMismatches: mismatches,
    metadata: { before, after },
    storage,
    summary,
    plans,
    batches,
    queries,
  };
  fs.writeFileSync(
    folder + "/verification.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ evidenceGates: summary }));
  return result;
}
