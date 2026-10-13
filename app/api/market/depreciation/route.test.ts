import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  rows: [] as any[],
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
    from: () => {
      const q: any = {
        then: (resolve: any) =>
          Promise.resolve({ data: state.rows, error: state.error }).then(
            resolve,
          ),
      };
      for (const method of [
        "select",
        "eq",
        "ilike",
        "not",
        "order",
        "limit",
        "gte",
        "lte",
      ])
        q[method] = (...args: unknown[]) => {
          state.calls.push([method, ...args]);
          return q;
        };
      return q;
    },
  }),
}));
import { GET } from "./route";
const row = (i: number, fields = {}) => ({
  source: "independent_dealer",
  source_url: `https://seller.example/car/${i}`,
  mileage: 20000 + i * 10000,
  ask_price: 25000 - i * 1000,
  title: "clean",
  condition: "excellent",
  last_seen_at: new Date().toISOString(),
  price_evidence: { kind: "asking", askingPrice: 25000 - i * 1000 },
  ...fields,
});
const request = (model = "Accord") =>
  GET(
    new NextRequest(
      `https://app.example/api/market/depreciation?make=Honda&model=${encodeURIComponent(model)}&year=2018`,
    ),
  );
beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.calls = [];
  state.allowed = true;
});
it("fits only current qualified cash asking prices and leaks no raw evidence", async () => {
  state.rows = Array.from({ length: 8 }, (_, i) => row(i));
  state.rows.push(
    row(10, {
      source: "copart",
      ask_price: 300,
      price_evidence: { kind: "current_bid", currentBid: 300 },
      listing_description: "private contact text",
    }),
  );
  const body = await (await request()).json();
  expect(body).toMatchObject({
    priceBasis: "reported_cash_asking",
    n: 8,
    cashSampleCount: 8,
    hasMore: false,
  });
  expect(body.trend).toHaveLength(2);
  expect(body.trend[0].mileage).toBe(20000);
  expect(body.trend[1].mileage).toBe(90000);
  expect(JSON.stringify(body)).not.toMatch(
    /private contact|price_evidence|description/,
  );
});
it("keeps unknown advertisements as research without inferring a cash trend", async () => {
  state.rows = Array.from({ length: 6 }, (_, i) =>
    row(i, { price_evidence: null }),
  );
  state.rows.push(
    row(10, { price_evidence: { kind: "monthly_payment", listedAmount: 300 } }),
  );
  const body = await (await request()).json();
  expect(body).toMatchObject({
    priceBasis: "advertised_amounts",
    n: 6,
    cashSampleCount: 0,
    trend: null,
    depreciationPer1000Miles: null,
  });
});
it("excludes stale and impossible observations and known bids", async () => {
  state.rows = [
    row(0, { last_seen_at: "2020-01-01" }),
    row(1, { mileage: -100 }),
    row(2, {
      source: "copart",
      price_evidence: { kind: "current_bid", currentBid: 400 },
    }),
  ];
  const body = await (await request()).json();
  expect(body).toMatchObject({ points: [], trend: null });
});
it("bounds work, matches the full model literally and withholds a truncated trend", async () => {
  state.rows = Array.from({ length: 501 }, (_, i) =>
    row(i, {
      ask_price: 12000,
      price_evidence: { kind: "asking", askingPrice: 12000 },
    }),
  );
  const body = await (await request("Accord_% Sport")).json();
  expect(state.calls).toContainEqual(["ilike", "model", "Accord\\_\\% Sport"]);
  expect(state.calls).toContainEqual(["limit", 501]);
  expect(body).toMatchObject({
    hasMore: true,
    n: 500,
    trend: null,
    priceBasis: "advertised_amounts",
  });
});
it("reports database outages separately from empty evidence", async () => {
  state.error = new Error("unavailable");
  expect((await request()).status).toBe(503);
});
it("rate limits before reading listings", async () => {
  state.allowed = false;
  expect((await request()).status).toBe(429);
  expect(state.calls).toEqual([]);
});
