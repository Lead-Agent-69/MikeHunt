// @vitest-environment node
// Opt in: MARKET_BATCH_TEST_CAP=500 (or 1000) node scripts/verify-market-candidate-projection.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgrestClient } from "@supabase/postgrest-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({ failAt: 0, repeatAt: 0 }));
const cap = Number(process.env.MARKET_BATCH_TEST_CAP || 0);
const endpoint = process.env.MARKET_PROJECTION_TEST_URL;
const relay = process.env.MARKET_PROJECTION_TEST_RELAY;
const internalUrl = process.env.MARKET_PROJECTION_TEST_INTERNAL_URL;
const execute = promisify(execFile);
const reads: { url: string; rows: number; bytes: number }[] = [];
let lastBody = "";
const header = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");
const payload =
  header +
  "." +
  Buffer.from(
    JSON.stringify({
      role: "service_role",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
const authorization =
  "Bearer " +
  payload +
  "." +
  createHmac("sha256", "local-market-projection-verification-secret-only")
    .update(payload)
    .digest("base64url");
const localFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (
    !/^dh-market-json-verify-[0-9]+-relay$/.test(relay || "") ||
    !/^http:\/\/dh-market-json-verify-[0-9]+-api:3000$/.test(
      internalUrl || "",
    ) ||
    url.origin !== endpoint ||
    ![500, 1000].includes(cap)
  )
    throw Error("Batch verification requires its isolated Docker relay");
  const headers = new Headers(init?.headers);
  const explain = headers.get("Accept")?.includes("pgrst.plan");
  if (!explain && control.failAt && reads.length + 1 >= control.failAt) {
    reads.push({ url: url.toString(), rows: -1, bytes: 0 });
    // Fault injection: successful batches still come from actual PostgREST.
    return new Response(
      JSON.stringify({ code: "XX000", message: "Injected mid-scan failure" }),
      { status: 503 },
    );
  }
  const { stdout } = await execute(
    "docker",
    [
      "exec",
      relay!,
      "node",
      "-e",
      "const q=JSON.parse(Buffer.from(process.argv[1],'base64').toString());fetch(q.url,q).then(async r=>console.log(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()}))).catch(()=>process.exit(1))",
      Buffer.from(
        JSON.stringify({
          url: internalUrl + url.pathname + url.search,
          method: init?.method,
          headers: Object.fromEntries(headers.entries()),
        }),
      ).toString("base64"),
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const response = JSON.parse(stdout);
  if (!explain) {
    expect(response.status).toBe(200);
    if (control.repeatAt === reads.length + 1) response.body = lastBody;
    lastBody = response.body;
    reads.push({
      url: url.toString(),
      rows: JSON.parse(response.body).length,
      bytes: Buffer.byteLength(response.body),
    });
  }
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
};
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () =>
    new PostgrestClient(endpoint!, {
      fetch: localFetch,
      headers: { Authorization: authorization },
    }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/deals/deal-desk-access", async (original) => ({
  ...(await original<object>()),
  resolveCallerFlipDesk: async () => true,
}));
import { GET } from "./route";
import { invalidate } from "@/lib/cache";

const search =
  "mode=all&states=MO,FL&seenWithin=30&hasPhotos=yes&priceBasis=cash&sort=askPrice&pageSize=50";
const request = (extra = "") =>
  GET(
    new NextRequest("http://local.test/api/market/explore?" + search + extra),
  );
const successful = async (extra = "") => {
  const response = await request(extra);
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
};

describe.skipIf(!cap)("actual PostgREST capped candidate scans", () => {
  beforeEach(() => {
    invalidate();
    reads.length = 0;
    control.failAt = 0;
    control.repeatAt = 0;
    lastBody = "";
  });

  it.each(["asc", "desc"])(
    "retains total, eligibility, cash sorting and three disjoint UI pages: %s",
    async (direction) => {
      const pages = [];
      for (let page = 0; page < 3; page++) {
        const body = await successful(`&sortDir=${direction}&page=${page}`);
        expect(body.total).toBe(2305);
        expect(body.pageSize).toBe(50);
        expect(body.rows).toHaveLength(50);
        pages.push(...body.rows);
      }
      expect(new Set(pages.map((row) => row.id)).size).toBe(150);
      const expected = Array.from({ length: 150 }, (_, i) =>
        direction === "asc" ? i + 1 : 2305 - i,
      );
      expect(pages.map((row) => row.id)).toEqual(
        expected.map(
          (i) => "00000000-0000-4000-8000-" + String(i).padStart(12, "0"),
        ),
      );
      expect(pages.map((row) => row.price.cashPrice)).toEqual(
        expected.map((i) => 10000 + i),
      );
      expect(reads.map((read) => read.rows)).toEqual(
        cap === 500 ? [500, 500, 500, 500, 305, 0] : [1000, 1000, 305, 0],
      );
      expect(
        reads.every(
          (read) => new URL(read.url).searchParams.get("limit") === "1000",
        ),
      ).toBe(true);
      expect(
        reads
          .slice(1)
          .every((read) =>
            new URL(read.url).searchParams.get("id")?.startsWith("gt."),
          ),
      ).toBe(true);
    },
  );

  it("requires an empty response after an exact multiple", async () => {
    const body = await successful("&makes=Ford");
    expect(body.total).toBe(2000);
    expect(reads.map((read) => read.rows)).toEqual(
      cap === 500 ? [500, 500, 500, 500, 0] : [1000, 1000, 0],
    );
  });

  it("returns the existing error response and retries the complete scan without partial cache", async () => {
    control.failAt = 2;
    const failed = await request();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toHaveProperty("error");
    expect(reads[0].rows).toBe(cap);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.slice(1).every((read) => read.rows === -1)).toBe(true);
    control.failAt = 0;
    reads.length = 0;
    const body = await successful();
    expect(body.total).toBe(2305);
    expect(reads.at(-1)?.rows).toBe(0);
    expect(new URL(reads[0].url).searchParams.has("id")).toBe(false);
  });

  it("retains the non-advancing ID guard", async () => {
    control.repeatAt = 2;
    expect((await request()).status).toBe(500);
    expect(reads).toHaveLength(2);
  });

  it(
    "records isolated full query plans and REST payload at 500 and 1000",
    { timeout: 120_000 },
    async () => {
      await successful();
      const first = new URL(reads[0].url);
      const measurements = [];
      for (let iteration = 0; iteration < 3; iteration++)
        for (const limit of [500, 1000]) {
          first.searchParams.set("limit", String(limit));
          const response = await localFetch(first.toString(), {
            headers: { Authorization: authorization },
          });
          const body = await response.text();
          const plan = await localFetch(first.toString(), {
            headers: {
              Authorization: authorization,
              Accept:
                'application/vnd.pgrst.plan+json; for="application/json"; options=analyze|buffers|verbose',
            },
          });
          expect(plan.ok).toBe(true);
          measurements.push({
            iteration,
            requestedLimit: limit,
            rows: JSON.parse(body).length,
            bytes: Buffer.byteLength(body),
            plan: await plan.json(),
          });
        }
      mkdirSync("artifacts/market-batch-verification", { recursive: true });
      writeFileSync(
        `artifacts/market-batch-verification/cap-${cap}.json`,
        JSON.stringify(
          {
            cap,
            source: "isolated synthetic fixture, not production or cold cache",
            measurements,
          },
          null,
          2,
        ),
      );
    },
  );
});
