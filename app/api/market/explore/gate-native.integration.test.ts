// @vitest-environment node
// Opt in only through the disposable --native-gates verification wrapper.
import fs from "node:fs";
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgrestClient } from "@supabase/postgrest-js";
import { expect, it } from "vitest";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";
import { applyRepairEligibility } from "@/lib/search/inventory-filters";
import { MARKET_CANDIDATE_FIELDS } from "@/lib/market/candidate-projection";

const endpoint = process.env.MARKET_NATIVE_GATE_URL;
const relay = process.env.MARKET_NATIVE_GATE_RELAY;
const internal = process.env.MARKET_NATIVE_GATE_INTERNAL_URL;
const execute = promisify(execFile);
const jwt = () => {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const data =
    part({ alg: "HS256", typ: "JWT" }) +
    "." +
    part({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 });
  return (
    data +
    "." +
    createHmac("sha256", "local-market-projection-verification-secret-only")
      .update(data)
      .digest("base64url")
  );
};

it.skipIf(!endpoint)(
  "keeps native PostgREST 14.5 bodies equal on small roots across warmed keyset scans",
  async () => {
    if (
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint!) ||
      !/^dh-market-json-verify-\d+-relay$/.test(relay || "") ||
      !/^http:\/\/dh-market-json-verify-\d+-api:3000$/.test(internal || "")
    )
      throw Error("Native gate test must use its isolated Docker relay");
    const stamp = process.env.MARKET_NATIVE_GATE_STAMP!;
    const stats = JSON.parse(process.env.MARKET_NATIVE_GATE_STATS!);
    expect(stats.stateType).toBe("character(2)");
    expect(stats.optionsDecodedBytes).toBeLessThan(2000);
    expect(stats.analysisDecodedBytes).toBeLessThan(2000);
    const client = new PostgrestClient(endpoint!);
    const rawFields = MARKET_CANDIDATE_FIELDS.split(",")
      .map((f) =>
        f === "evidence_gates"
          ? "evidence_gates:deal_analysis->evidenceGates"
          : f,
      )
      .join(",");
    const url = (raw: boolean) => {
      let query = applyBuyableInventory(
        client
          .from(
            raw
              ? "market_candidate_projection_raw_gates"
              : "market_candidate_projection",
          )
          .select(raw ? rawFields : MARKET_CANDIDATE_FIELDS),
        Date.parse(stamp),
        { includeWithoutPhotos: true, observedDays: 30 },
      );
      query = applyRepairEligibility(query, "0")
        .in("location_state", ["MO", "FL"])
        .not("images", "is", null)
        .neq("images", "{}")
        .or(
          "options->photoAudit->>state.is.null,options->photoAudit->>state.neq.unavailable",
        )
        .order("id", { ascending: true })
        .limit(500);
      const parsed = new URL((query as unknown as { url: URL }).url);
      return internal + parsed.pathname + parsed.search;
    };
    const config = { urls: { raw: url(true), view: url(false) }, token: jwt() };
    // Timers run INSIDE the persistent relay process. Docker/CLI startup is not
    // included. These are local native HTTP timings, never production SLA proof.
    const script = `const crypto=require('node:crypto');const c=JSON.parse(process.argv[1]);
    const headers={Authorization:'Bearer '+c.token};
    async function scan(kind){let cursor='',count=0,bytes=0,httpMs=0,parsedMs=0;const hash=crypto.createHash('sha256'),ids=new Set(),ranges=[];let types=new Set(),keys=[];
      for(let batch=0;;batch++){if(batch>20)throw Error('Fixture scan exceeded bound');const u=new URL(c.urls[kind]);if(cursor)u.searchParams.set('id','gt.'+cursor);const start=performance.now();const r=await fetch(u,{headers,signal:AbortSignal.timeout(20000)});const text=await r.text();httpMs+=performance.now()-start;if(r.status!==200)throw Error('Native request '+r.status+': '+text.slice(0,200));
        const parseStart=performance.now();const rows=JSON.parse(text);parsedMs+=performance.now()-parseStart;if(!Array.isArray(rows))throw Error('Expected native array');ranges.push(r.headers.get('content-range'));hash.update(JSON.stringify(rows));bytes+=Buffer.byteLength(text);if(!rows.length)break;
        keys=Object.keys(rows[0]);for(const row of rows){if(ids.has(row.id))throw Error('Duplicate keyset ID');ids.add(row.id);types.add(typeof row.evidence_gates?.costsConfirmed);if(JSON.stringify(row).includes('private-analysis-sentinel')||JSON.stringify(row).includes('private-options-sentinel'))throw Error('Private root leaked');}count+=rows.length;const next=rows.at(-1).id;if(next<=cursor)throw Error('Keyset did not advance');cursor=next;
      }
      return {kind,count,bytes,httpMs,parsedMs,sha256:hash.digest('hex'),ranges,fieldCount:keys.length,gateTypes:[...types].sort(),repairSentinelsExcluded:!ids.has('00000000-0000-4000-8000-000000000001')&&!ids.has('00000000-0000-4000-8000-000000000007'),cleanControlPresent:ids.has('00000000-0000-4000-8000-000000000002')};
    }
    (async()=>{for(let warm=0;warm<2;warm++){await scan('raw');await scan('view');}const runs=[];for(let round=0;round<8;round++)for(const kind of round%2?['view','raw']:['raw','view'])runs.push({round,...await scan(kind)});
      const diagResponse=await fetch(new URL('/rpc/market_projection_native_diag',c.urls.view),{headers});if(!diagResponse.ok)throw Error('Diagnostics denied');const diagnostic=await diagResponse.json();
      const anonResponse=await fetch(new URL('/market_candidate_projection?select=id&limit=1',c.urls.view));console.log(JSON.stringify({runs,diagnostic,anonStatus:anonResponse.status}));
    })().catch(e=>{console.error(e.message);process.exit(1)});`;
    const { stdout } = await execute(
      "docker",
      ["exec", relay!, "node", "-e", script, JSON.stringify(config)],
      { maxBuffer: 8 * 1024 * 1024, timeout: 180000 },
    );
    const result = JSON.parse(stdout);
    for (let round = 0; round < 8; round++) {
      const raw = result.runs.find(
        (r: any) => r.round === round && r.kind === "raw",
      );
      const view = result.runs.find(
        (r: any) => r.round === round && r.kind === "view",
      );
      expect(view.sha256).toBe(raw.sha256);
      expect(view.bytes).toBe(raw.bytes);
      expect(view.ranges).toEqual(raw.ranges);
      expect(view.count).toBeGreaterThan(1000);
      expect(view.fieldCount).toBe(MARKET_CANDIDATE_FIELDS.split(",").length);
      expect(view.gateTypes).toEqual(["boolean", "string", "undefined"]);
      expect(view.repairSentinelsExcluded).toBe(true);
      expect(view.cleanControlPresent).toBe(true);
    }
    expect(result.diagnostic.role).toBe("service_role");
    expect(result.diagnostic.mode).toBe("auto");
    expect(
      result.diagnostic.prepared.some(
        (p: any) =>
          p.statement.includes("pg_catalog.count(_postgrest_t)") &&
          p.statement.includes("coalesce(json_agg(_postgrest_t)"),
      ),
    ).toBe(true);
    expect(
      result.diagnostic.prepared.every(
        (p: any) =>
          p.parameter_types.includes("character[]") ||
          p.parameter_types.includes("bpchar[]"),
      ),
    ).toBe(true);
    expect(
      result.diagnostic.prepared.some(
        (p: any) => p.generic_plans + p.custom_plans >= 6,
      ),
    ).toBe(true);
    expect([401, 403, 404]).toContain(result.anonStatus);
    const median = (values: number[]) => {
      const a = values.slice().sort((x, y) => x - y);
      return (a[3] + a[4]) / 2;
    };
    const rawMs = median(
      result.runs
        .filter((r: any) => r.kind === "raw")
        .map((r: any) => r.httpMs),
    );
    const viewMs = median(
      result.runs
        .filter((r: any) => r.kind === "view")
        .map((r: any) => r.httpMs),
    );
    const slowerPairs = Array.from(
      { length: 8 },
      (_, round) =>
        result.runs.find((r: any) => r.round === round && r.kind === "view")
          .httpMs >
        result.runs.find((r: any) => r.round === round && r.kind === "raw")
          .httpMs,
    ).filter(Boolean).length;
    const summary = {
      rawMs,
      viewMs,
      changePct: (100 * (viewMs - rawMs)) / rawMs,
      slowerPairs,
      robustRegression: viewMs > rawMs * 1.25 && slowerPairs >= 7,
    };
    fs.mkdirSync("test-results/market-evidence-gates", { recursive: true });
    fs.writeFileSync(
      "test-results/market-evidence-gates/native-rest14.json",
      JSON.stringify(
        {
          profile: "small-root synthetic, not production latency",
          image: "ghcr.io/supabase/postgrest:v14.5",
          stamp,
          stats,
          summary,
          ...result,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ native14: summary, stats }));
    expect(
      summary.robustRegression,
      "Native benchmark regressed consistently; hold candidate",
    ).toBe(false);
  },
  190000,
);
