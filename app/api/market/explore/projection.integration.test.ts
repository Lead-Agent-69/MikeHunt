// @vitest-environment node
// Opt in via scripts/verify-market-candidate-projection.mjs; loopback only.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PostgrestClient } from "@supabase/postgrest-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({ legacy: false, flip: true }));
const endpoint = process.env.MARKET_PROJECTION_TEST_URL;
const relay = process.env.MARKET_PROJECTION_TEST_RELAY;
const internalUrl = process.env.MARKET_PROJECTION_TEST_INTERNAL_URL;
const execute = promisify(execFile);
if (endpoint) {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1")
    throw new Error(
      "Projection verification is restricted to isolated loopback PostgREST",
    );
}
const localFetch: typeof fetch = async (input, init) => {
  if (!relay) return fetch(input, init);
  if (
    !/^dh-market-json-verify-[0-9]+-relay$/.test(relay) ||
    !/^http:\/\/dh-market-json-verify-[0-9]+-api:3000$/.test(internalUrl || "")
  )
    throw new Error("Unexpected verification relay");
  const url = new URL(String(input));
  if (url.origin !== endpoint) throw new Error("Unexpected REST destination");
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
const legacyFields = readFileSync(
  "supabase/tests/market-candidate-legacy-select.txt",
  "utf8",
).trim();
const token = (role: string) => {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  const payload = header + "." + body;
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
    headers: { Authorization: "Bearer " + token("service_role") },
  });
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (relation: string) => {
      const query = client().from(control.legacy ? "deals" : relation);
      const select = query.select.bind(query);
      return {
        select: (fields: string) =>
          select(control.legacy ? legacyFields : fields),
      };
    },
  }),
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
  resolveCallerFlipDesk: async () => control.flip,
}));
import { GET } from "./route";
import { invalidate } from "@/lib/cache";
import { MARKET_CANDIDATE_FIELDS } from "@/lib/market/candidate-projection";

const request = async (search: string) => {
  const result = await GET(
    new NextRequest("http://local.test/api/market/explore?" + search),
  );
  const data = await result.json();
  expect(result.status, JSON.stringify(data)).toBe(200);
  if (data.summary) data.summary.asOf = "(request time)";
  return data;
};
const paired = async (search: string) => {
  control.legacy = true;
  invalidate();
  const original = await request(search);
  control.legacy = false;
  invalidate();
  const projected = await request(search);
  expect(projected).toEqual(original);
  expect(JSON.stringify(projected)).not.toMatch(
    /private-options-sentinel|private-analysis-sentinel|"deal_analysis"|"options"/,
  );
  return projected;
};

describe.skipIf(!endpoint)(
  "real PostgreSQL/PostgREST Market projection",
  () => {
    beforeEach(() => {
      control.flip = true;
      control.legacy = false;
      invalidate();
    });

    it("keeps every selected field equal through actual JSON decoding", async () => {
      const base = await client()
        .from("deals")
        .select(legacyFields)
        .order("id");
      const view = await client()
        .from("market_candidate_projection")
        .select(MARKET_CANDIDATE_FIELDS)
        .order("id");
      expect(base.error).toBeNull();
      expect(view.error).toBeNull();
      expect(view.data).toEqual(base.data);
      expect(view.data).toHaveLength(520);
      expect(
        view.data!.filter(
          (row: any) => row.acquisition_price_missing === "true",
        ).length,
      ).toBeGreaterThan(0);
      expect(
        view.data!.filter((row: any) => row.analysis_roi === "20").length,
      ).toBeGreaterThan(0);
    });

    it.each(["asc", "desc"])(
      "keeps cash eligibility and ordering through three pages: %s",
      async (direction) => {
        const pages: any[] = [];
        for (let page = 0; page < 3; page++) {
          const result = await paired(
            "states=MO,FL&seenWithin=30&includeRepairable=0&hasPhotos=yes&priceBasis=cash&sort=askPrice&sortDir=" +
              direction +
              "&pageSize=50&page=" +
              page,
          );
          expect(result.rows).toHaveLength(50);
          pages.push(result);
        }
        const rows = pages.flatMap((page) => page.rows);
        expect(new Set(rows.map((row) => row.id)).size).toBe(150);
        const prices = rows
          .map((row) => row.price.cashPrice)
          .filter((price) => price != null);
        expect(prices).toEqual(
          prices.slice().sort((a, b) => (direction === "asc" ? a - b : b - a)),
        );
      },
    );

    it.each([
      "aggregate=1&states=MO,FL&hasPhotos=yes&priceBasis=cash",
      "states=MO,FL&hasPhotos=no&pricePolicy=include",
      "states=MO,FL&hasPhotos=any&priceBasis=cash&priceMax=1000",
      "states=MO,FL&hasPhotos=any&priceKind=monthly_payment",
      "states=MO,FL&hasPhotos=any&priceKind=down_payment",
      "states=MO,FL&hasPhotos=any&mode=curated&minProfit=1&minRoi=1&sort=profitEstimate",
      "states=MO,FL&hasPhotos=any&titleType=unknown&includeRepairable=0",
      "states=MO,FL&sources=independent_dealer&sellerTypes=dealer&fuelType=Gas&transmission=Automatic&drivetrain=AWD&hasPhotos=yes",
      "near=63101&radius=50&hasPhotos=any&keys=yes&runDrive=yes&hasVin=yes&listingZip=63101&city=St+Louis&assemblyCountry=United+States&availability=on_lot",
      "states=MO,FL&hasPhotos=any&minBuyNow=10000&maxBuyNow=15000&buyNow=1",
    ])("preserves aggregate and filter contracts: %s", async (search) => {
      await paired(search);
    });

    it("keeps personal desk redaction after shared projection reads", async () => {
      control.flip = false;
      const result = await paired(
        "mode=curated&minProfit=999999&minRoi=999&verdicts=go&hasPhotos=any",
      );
      expect(result.deskAccess).toBe("personal");
      expect(result.facets.laneProfit).toEqual({});
      for (const row of result.rows) {
        expect(row).not.toHaveProperty("profitEstimate");
        expect(row).not.toHaveProperty("recommendedMaxBid");
      }
    });

    it("keeps bounded streaming and continuation identical", async () => {
      for (const sort of ["lastSeenAt", "mileage"]) {
        const search =
          "browse=1&sort=" +
          sort +
          "&sortDir=desc&states=MO,FL&hasPhotos=yes&pageSize=20";
        const first = await paired(search);
        expect(first.rows).toHaveLength(20);
        expect(first.nextCursor).toBeTruthy();
        const second = await paired(
          search + "&after=" + encodeURIComponent(first.nextCursor),
        );
        const firstIds = new Set(first.rows.map((row: any) => row.id));
        expect(second.rows.every((row: any) => !firstIds.has(row.id))).toBe(
          true,
        );
      }
    });

    it("rejects anonymous and authenticated direct view access", async () => {
      for (const role of ["anon", "authenticated"]) {
        const response = await localFetch(
          endpoint + "/market_candidate_projection?select=id&limit=1",
          { headers: { Authorization: "Bearer " + token(role) } },
        );
        expect(response.ok).toBe(false);
        expect((await response.json()).code).toBe("42501");
      }
    });
  },
);
