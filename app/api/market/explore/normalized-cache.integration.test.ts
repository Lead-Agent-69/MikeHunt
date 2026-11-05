// @vitest-environment node
// Opt in: MARKET_NORMALIZED_CACHE_TEST=1 node scripts/verify-market-candidate-projection.mjs
// Disposable local PostgreSQL/PostgREST only; baseline is git show of the approved parent.
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { PostgrestClient } from "@supabase/postgrest-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  flip: true,
  reads: 0,
  memory: null as null | Record<string, unknown>[],
}));
const endpoint = process.env.MARKET_PROJECTION_TEST_URL;
const relay = process.env.MARKET_PROJECTION_TEST_RELAY;
const internalUrl = process.env.MARKET_PROJECTION_TEST_INTERNAL_URL;
const baselineFile = process.env.MARKET_NORMALIZED_BASELINE;
const execute = promisify(execFile);
if (endpoint && !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint))
  throw Error("Normalized-cache verification is loopback-only");
const localFetch: typeof fetch = async (input, init) => {
  state.reads++;
  const url = new URL(String(input));
  if (url.origin !== endpoint) throw Error("Unexpected REST destination");
  if (state.memory) {
    const after = url.searchParams.get("id")?.replace(/^gt\./, "");
    const rows = state.memory.filter((row) => !after || String(row.id) > after);
    return new Response(
      JSON.stringify(
        rows.slice(0, Number(url.searchParams.get("limit")) || 1000),
      ),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }
  if (!relay) return fetch(input, init);
  if (
    !/^dh-market-json-verify-[0-9]+-relay$/.test(relay) ||
    !/^http:\/\/dh-market-json-verify-[0-9]+-api:3000$/.test(internalUrl || "")
  )
    throw Error("Unexpected local verification relay");
  const request = {
    url: internalUrl + url.pathname + url.search,
    method: init?.method,
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
  };
  const { stdout } = await execute(
    "docker",
    [
      "exec",
      relay,
      "node",
      "-e",
      "const q=JSON.parse(process.argv[1]);fetch(q.url,q).then(async r=>console.log(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()}))).catch(e=>{console.error(e.name);process.exit(1)})",
      JSON.stringify(request),
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const response = JSON.parse(stdout);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};
const token = () => {
  const payload =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        role: "service_role",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", "local-market-projection-verification-secret-only")
      .update(payload)
      .digest("base64url")
  );
};
const client = () =>
  new PostgrestClient(endpoint!, {
    fetch: localFetch,
    headers: { Authorization: "Bearer " + token() },
  });
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => client(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/geo/geocode", () => ({
  geocodeZip: async () => ({ lat: 38.63, lng: -90.2 }),
}));
vi.mock("@/lib/deals/deal-desk-access", async (original) => ({
  ...(await original<object>()),
  resolveCallerFlipDesk: async () => state.flip,
}));
import { GET } from "./route";
import { invalidate } from "@/lib/cache";
import * as priceContext from "@/lib/deals/source-price-context";
import { MARKET_CANDIDATE_FIELDS } from "@/lib/market/candidate-projection";

const report: Record<string, unknown> = {
  fixtureRows: 520,
  baseline: "42e72e120fe262404f68b7ce5b9c6a6de24ee057",
  comparisons: [],
};
const save = () => {
  mkdirSync("artifacts/market-normalized-cache", { recursive: true });
  writeFileSync(
    "artifacts/market-normalized-cache/verification.json",
    JSON.stringify(report, null, 2),
  );
};
const request = async (handler: typeof GET, query: string) => {
  const response = await handler(
    new NextRequest("http://local.test/api/market/explore?" + query),
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
};
const fullPages = async (handler: typeof GET, query: string) => {
  const pages = [await request(handler, query + "&pageSize=200")];
  for (let page = 1; page < Math.ceil(pages[0].total / 200); page++)
    pages.push(await request(handler, `${query}&pageSize=200&page=${page}`));
  return pages;
};
describe.skipIf(!endpoint || !baselineFile)(
  "normalized eligibility actual REST baseline parity",
  () => {
    beforeEach(() => {
      invalidate();
      state.flip = true;
      state.reads = 0;
      state.memory = null;
      // Keep request clocks identical without replacing network/timer behavior.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date());
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it.each([true, false])(
      "matches every response field through all pages, flip=%s",
      async (flip) => {
        const baseline = (await import(/* @vite-ignore */ baselineFile!))
          .GET as typeof GET;
        state.flip = flip;
        const queries = [
          "mode=all&browse=1&priceBasis=cash&states=MO,FL&hasPhotos=yes&includeRepairable=0&sort=askPrice&sortDir=asc",
          "mode=all&browse=1&priceBasis=cash&states=MO,FL&hasPhotos=yes&includeRepairable=0&sort=askPrice&sortDir=desc",
          "mode=all&browse=1&priceBasis=cash&states=MO,FL&hasPhotos=yes&includeRepairable=0&aggregate=1&sort=lastSeenAt&sortDir=desc",
          "mode=all&hasPhotos=any&sort=askPrice&sortDir=asc",
          "mode=all&hasPhotos=any&priceBasis=cash&pricePolicy=reported&minPrice=1&sort=askPrice&sortDir=desc",
          "mode=curated&hasPhotos=any&minProfit=1&sort=profitEstimate",
          "mode=all&hasPhotos=any&near=63101&radius=50&sort=distanceMiles",
          "mode=all&browse=1&sort=mileage&pageSize=50",
        ];
        const original = [];
        for (const query of queries)
          original.push(await fullPages(baseline, query));
        invalidate();
        for (let i = 0; i < queries.length; i++) {
          const current = await fullPages(GET, queries[i]);
          expect(current).toEqual(original[i]);
          expect(JSON.stringify(current)).not.toMatch(
            /private-options-sentinel|private-analysis-sentinel|"evidence_gates"|"deal_analysis"/,
          );
          (report.comparisons as unknown[]).push({
            flip,
            query: queries[i],
            pages: current.length,
            total: current[0].total,
            fullBodyEqual: true,
          });
        }
        save();
      },
      120_000,
    );

    it("records normalization/CPU savings on repeated synthetic 15000-row sorts and Insights", async () => {
      const baseline = (await import(/* @vite-ignore */ baselineFile!))
        .GET as typeof GET;
      const fixture = await client()
        .from("market_candidate_projection")
        .select(MARKET_CANDIDATE_FIELDS)
        .order("id");
      expect(fixture.error).toBeNull();
      expect(fixture.data).toHaveLength(520);
      const template = fixture.data!.find(
        (row: any) => row.make === "Ford" && row.images?.length > 1,
      ) as unknown as Record<string, unknown>;
      state.memory = Array.from({ length: 15000 }, (_, i) => ({
        ...template,
        id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0"),
      }));
      const price = vi.spyOn(priceContext, "sourcePriceContext");
      const variants = [
        "sort=askPrice&sortDir=asc",
        "sort=askPrice&sortDir=desc",
        "aggregate=1&sort=lastSeenAt&sortDir=desc",
      ];
      const runs = [];
      const outputs = [];
      for (const [name, handler] of [
        ["baseline", baseline],
        ["normalized", GET],
      ] as const) {
        invalidate();
        state.reads = 0;
        price.mockClear();
        const cpu = process.cpuUsage();
        const started = performance.now();
        const bodies = [];
        for (const variant of variants)
          bodies.push(
            await request(
              handler,
              "mode=all&browse=1&hasPhotos=any&priceBasis=cash&" + variant,
            ),
          );
        const usage = process.cpuUsage(cpu);
        outputs.push(bodies);
        runs.push({
          name,
          rows: 15000,
          payloads: 3,
          restBatches: state.reads,
          normalizedRows: price.mock.calls.length,
          wallMs: Math.round(performance.now() - started),
          cpuMs: (usage.user + usage.system) / 1000,
        });
      }
      expect(outputs[1]).toEqual(outputs[0]);
      expect(runs[0].normalizedRows).toBe(45000);
      expect(runs[1].normalizedRows).toBe(15000);
      expect(runs[1].restBatches).toBe(runs[0].restBatches);
      report.syntheticCpu = {
        source:
          "synthetic copies of one locally REST-decoded row; warm DB and in-process REST stand-in, not production performance",
        runs,
      };
      save();
      console.log("normalized-cache.synthetic-cpu", runs);
    }, 120_000);
  },
);
