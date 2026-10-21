import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  base: null as any,
  rows: [] as any[],
  baseError: null as any,
  error: null as any,
  calls: [] as unknown[][],
  allowed: true,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: state.allowed }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => {
      const query: any = {
        maybeSingle: async () => ({ data: state.base, error: state.baseError }),
        then: (resolve: any) =>
          Promise.resolve({ data: state.rows, error: state.error }).then(
            resolve,
          ),
      };
      for (const method of ["select", "eq", "order", "limit"])
        query[method] = (...args: unknown[]) => {
          state.calls.push([table, method, ...args]);
          return query;
        };
      return query;
    },
  }),
}));
import { GET } from "./route";
const vin = "1HGCM82633A004352";
const listing = (id: string, fields = {}) => ({
  id,
  vin,
  make: "Honda",
  model: "Accord",
  year: 2003,
  source: "independent_dealer",
  ask_price: 15000,
  price_evidence: { kind: "asking", askingPrice: 15000 },
  source_url: `https://seller.example/car/${id}`,
  last_seen_at: new Date().toISOString(),
  title: "clean",
  condition: "excellent",
  mileage: 50000,
  ...fields,
});
const request = () =>
  GET(new NextRequest("https://app.example/api/deals/a/sources"), {
    params: Promise.resolve({ id: "a" }),
  });
beforeEach(() => {
  state.base = listing("a");
  state.rows = [];
  state.baseError = state.error = null;
  state.calls = [];
  state.allowed = true;
});
describe("reported VIN price comparisons", () => {
  it("compares asking/buy-now amounts while retaining unlike amounts", async () => {
    state.rows = [
      listing("a"),
      listing("cash", {
        ask_price: 2000,
        price_evidence: { kind: "asking", askingPrice: 17000 },
      }),
      listing("payment", {
        ask_price: 300,
        price_evidence: { kind: "monthly_payment", listedAmount: 300 },
      }),
      listing("bid", {
        source: "copart",
        ask_price: 500,
        price_evidence: { kind: "current_bid", currentBid: 500 },
      }),
    ];
    const body = await (await request()).json();
    expect(body).toMatchObject({
      count: 4,
      comparableCount: 2,
      cheapest: 15000,
      dearest: 17000,
      spread: 2000,
      hasMore: false,
    });
    expect(body.sources.find((s: any) => s.id === "payment")).toMatchObject({
      askPrice: 300,
      priceContext: { kind: "monthly_payment", comparisonEligible: false },
    });
    expect(
      body.sources.find((s: any) => s.id === "bid").priceContext.cashPrice,
    ).toBeNull();
    expect(state.calls).toContainEqual(["deals", "limit", 51]);
  });
  it("shows expired and stale observations without inventing a current cash range", async () => {
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    state.rows = [
      listing("a"),
      listing("expired", {
        source: "copart",
        buy_now_price: 1000,
        auction_end_at: new Date().toISOString(),
        price_evidence: { kind: "current_bid", currentBid: 500 },
      }),
      listing("stale", { last_seen_at: old }),
      listing("old-price-check", {
        listing_description: "Cash price: $15,000",
        price_evidence: { kind: "asking", askingPrice: 15000, checkedAt: old },
      }),
    ];
    const body = await (await request()).json();
    expect(body).toMatchObject({
      count: 4,
      comparableCount: 1,
      cheapest: null,
      dearest: null,
      spread: null,
    });
    expect(body.sources).toHaveLength(4);
    expect(body.sources.find((s: any) => s.id === "expired")).toMatchObject({
      askPrice: 500,
      priceContext: { cashPrice: 1000, comparisonEligible: false },
    });
  });

  it("does not return fake zero spread for one eligible price", async () => {
    state.rows = [listing("a")];
    expect(await (await request()).json()).toMatchObject({
      cheapest: null,
      dearest: null,
      spread: null,
      comparableCount: 1,
    });
  });
  it("withholds ranges from a truncated observation window", async () => {
    state.rows = Array.from({ length: 51 }, (_, i) => listing(String(i)));
    const body = await (await request()).json();
    expect(body).toMatchObject({
      count: 50,
      hasMore: true,
      cheapest: null,
      spread: null,
    });
    expect(body.sources).toHaveLength(50);
  });
  it("does not expose fetched titles, descriptions, seller flags or evidence text", async () => {
    state.rows = [
      listing("a", {
        listing_title: "private-title",
        listing_description: "private-contact",
        seller_type: "dealer",
        price_evidence: {
          kind: "asking",
          askingPrice: 15000,
          evidenceText: "private-evidence",
        },
      }),
    ];
    expect(await (await request()).text()).not.toMatch(
      /private-title|private-contact|private-evidence|seller_type|listing_description/,
    );
    expect(
      state.calls
        .filter((c) => c[1] === "select")
        .every((c) =>
          String(c[2]).includes("price_evidence:options->priceEvidence"),
        ),
    ).toBe(true);
  });
  it.each([null, "00000000000000000", "INVALIDVIN00000000", "short"])(
    "skips unusable VIN %s",
    async (value) => {
      state.base.vin = value;
      expect(await (await request()).json()).toMatchObject({
        vin: null,
        count: 0,
        cheapest: null,
        spread: null,
      });
      expect(state.calls.some((c) => c[1] === "limit")).toBe(false);
    },
  );
  it("does not let legacy clients plot a bid as an asking price", async () => {
    state.base = listing("bid", {
      source: "copart",
      ask_price: 500,
      price_evidence: { kind: "current_bid", currentBid: 500 },
    });
    expect((await (await request()).json()).base).toMatchObject({
      askPrice: null,
      cashPrice: null,
      canCompareToAskingCurve: false,
    });
  });
  it("surfaces either query error without exposing internals", async () => {
    state.baseError = { message: "private database error" };
    expect((await request()).status).toBe(503);
    state.baseError = null;
    state.error = { message: "private database error" };
    const result = await request();
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private database error");
  });
  it("limits requests before touching the database", async () => {
    state.allowed = false;
    expect((await request()).status).toBe(429);
    expect(state.calls).toHaveLength(0);
  });
});
