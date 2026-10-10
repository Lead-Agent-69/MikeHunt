// @vitest-environment node
// Contract tests for POST /api/check-listing: soft-fail paths and caching headers.
// Complements route.test.ts (happy paths, desks, dealId, limits); same mock harness style.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scrape = vi.hoisted(() => vi.fn());
const vin = vi.hoisted(() => ({ result: undefined as unknown }));
const data = vi.hoisted(() => ({ fail: null as Error | null }));
const limit = vi.hoisted(() => ({ allowed: true }));
const tables = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));

vi.mock("@/lib/save-from-url/scrape-listing", () => ({
  scrapeOrParseListing: scrape,
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => false,
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: null }, error: null }),
}));
vi.mock("@/lib/vehicle/nhtsa", () => ({
  decodeVin: async () =>
    vin.result === undefined
      ? { year: 2018, make: "HONDA", model: "Civic", trim: "EX" }
      : vin.result,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: limit.allowed }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/intelligence/check-listing-data", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("@/lib/intelligence/check-listing-data")
    >();
  return {
    ...real,
    loadCheckListingData: (
      ...args: Parameters<typeof real.loadCheckListingData>
    ) =>
      data.fail
        ? Promise.reject(data.fail)
        : real.loadCheckListingData(...args),
  };
});
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from(table: string) {
      const q: any = {};
      for (const m of [
        "select",
        "eq",
        "in",
        "ilike",
        "gte",
        "lte",
        "gt",
        "limit",
        "order",
      ])
        q[m] = () => q;
      q.maybeSingle = async () => ({ data: null, error: null });
      q.then = (ok: any, bad: any) =>
        Promise.resolve({ data: tables.rows[table] || [], error: null }).then(
          ok,
          bad,
        );
      return q;
    },
  }),
}));

import { invalidate } from "@/lib/cache";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import { POST } from "./route";

const seen = new Date(Date.now() - 2 * 3_600_000).toISOString();
const ask = (id: string, price: number) => ({
  id,
  year: 2018,
  make: "Honda",
  model: "Civic",
  mileage: 70000,
  ask_price: price,
  source: "craigslist",
  source_deal_id: `cl-${id}`,
  source_url: `https://x.example/${id}`,
  location_state: "IL",
  last_seen_at: seen,
  condition: "clean_title",
  updated_at: seen,
});
const SIX = () =>
  [15000, 15200, 15500, 15800, 16000, 16200].map((p, i) => ask(`c${i}`, p));
const raw = (body: string) =>
  POST(
    new NextRequest("http://localhost/api/check-listing", {
      method: "POST",
      body,
    }),
  );
const post = (body: unknown) => raw(JSON.stringify(body));
const NO_STORE = "private, no-store";

describe("POST /api/check-listing contract", () => {
  beforeEach(() => {
    scrape.mockReset();
    vin.result = undefined;
    data.fail = null;
    limit.allowed = true;
    tables.rows = { deals: SIX() };
    invalidate("check-listing:");
  });

  it("200: structured details return one private card for a signed-out buyer", async () => {
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      mileage: 71000,
      price: 9000,
      zip: "60432",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    const body = await res.json();
    expect(body.desk).toBe("personal");
    expect(body.read.fairValue.comps).toBeGreaterThanOrEqual(3);
    expect(body.read.profit).toBeNull(); // flip economics never reach a personal desk
  });

  it("400: a body that is not JSON", async () => {
    const res = await raw("{not json");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(await res.json()).toEqual({ error: "Invalid body" });
  });

  it.each([
    ["an empty object", {}],
    ["an array", [1, 2]],
    ["free text with no car in it", { q: "hello" }],
    ["a non-http link", { url: "ftp://dealer.example/car" }],
  ])("400: %s gets a plain error, no card", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    const json = await res.json();
    expect(typeof json.error).toBe("string");
    expect(json.read).toBeUndefined();
  });

  it("400: a link to a private or blocked address is refused, not fetched blind", async () => {
    scrape.mockRejectedValueOnce(new UrlNotAllowedError());
    const res = await post({ url: "http://127.0.0.1/admin" });
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect((await res.json()).error).toMatch(/public listing link/);
  });

  it("422: the listing site failing (network error) asks for details instead of guessing", async () => {
    scrape.mockRejectedValueOnce(new Error("ECONNRESET"));
    const res = await post({ url: "https://dealer.example/2018-civic" });
    expect(res.status).toBe(422);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    const json = await res.json();
    expect(json.code).toBe("PAGE_UNREADABLE");
    expect(JSON.stringify(json)).not.toMatch(/ECONNRESET/);
  });

  it("400 NEED_VEHICLE: a VIN NHTSA can't decode, with no make/model given", async () => {
    vin.result = null;
    const res = await post({ vin: "1HGCV1F30LA000000", price: 9000 });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NEED_VEHICLE");
  });

  it("400 NEED_PRICE: a readable page with no price never gets an invented one", async () => {
    scrape.mockResolvedValueOnce({
      year: 2018,
      make: "Honda",
      model: "Civic",
      mileage: 71000,
    });
    const res = await post({ url: "https://dealer.example/2018-civic" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NEED_PRICE");
  });

  it("503: market data upstream failure is a private retry message, no internals", async () => {
    data.fail = new Error("supabase timeout at db.internal:5432");
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      price: 9000,
      zip: "60432",
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    const text = await res.text();
    expect(JSON.parse(text).error).toMatch(/temporarily unavailable/);
    expect(text).not.toMatch(/supabase|5432|internal/);
  });

  it("200 not_enough_data: under 3 comps never produces a number", async () => {
    tables.rows = { deals: [ask("only", 15000)] };
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      price: 9000,
      zip: "60432",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    const { read } = await res.json();
    expect(read.verdict).toBe("not_enough_data");
    expect(read.fairValue.value).toBeNull();
  });

  it("429: rate-limited responses are private too", async () => {
    limit.allowed = false;
    const res = await post({ make: "Honda", model: "Civic", price: 9000 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
  });
});
