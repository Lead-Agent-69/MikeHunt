// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ rows: [] as any[], error: null as any, tables: [] as string[], filters: [] as unknown[][] }));

function chain(table: string) {
  const c: any = {};
  for (const m of ["select", "order", "limit", "not", "gte"]) c[m] = vi.fn(() => c);
  for (const m of ["eq", "ilike"])
    c[m] = vi.fn((...a: unknown[]) => {
      state.filters.push([m, ...a]);
      return c;
    });
  c.range = vi.fn((from: number, to: number) => {
    c._page = state.rows.slice(from, to + 1);
    return c;
  });
  c.then = (res: any, rej: any) =>
    Promise.resolve(
      table === "price_history"
        ? { data: state.error ? null : (c._page ?? state.rows), error: state.error }
        : { data: [] },
    ).then(res, rej);
  return c;
}

vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (t: string) => {
      state.tables.push(t);
      return chain(t);
    },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

import { GET } from "./route";

const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day).toISOString();
const deal = (o: Record<string, unknown> = {}) => ({
  make: "Ford", model: "Explorer", year: 2018, mileage: 90_000, trim: "XLT",
  source: "independent_dealer", auction_end_at: null, last_seen_at: ago(0.5), ...o,
});
const req = () => new NextRequest("https://x.test/api/market/timing?make=Ford&model=Explorer");

beforeEach(() => {
  state.rows = [];
  state.error = null;
  state.tables = [];
  state.filters = [];
});

describe("/api/market/timing like-for-like", () => {
  it("no longer reads the mix-averaging view; filters price_history by make + model token", async () => {
    await GET(req());
    expect(state.tables).not.toContain("market_timing_signals");
    expect(state.tables).toContain("price_history");
    expect(state.filters).toContainEqual(["eq", "deals.make", "Ford"]);
    expect(state.filters).toContainEqual(["ilike", "deals.model", "%Explorer%"]);
  });

  it("mix shift: no BUY_NOW, confidence none, legacy fields null", async () => {
    state.rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ deal_id: `o${i}`, price: 13_000, observed_at: ago(15), deals: deal({ year: 2016, last_seen_at: ago(12) }) })),
      ...Array.from({ length: 35 }, (_, i) => ({ deal_id: `n${i}`, price: 30_000 + i * 300, observed_at: ago(2), deals: deal({ year: 2023, mileage: 20_000, trim: "ST" }) })),
    ];
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({
      timing_signal: null, signal: null, confidence: "none", basis: "none",
      pct_change_30d: null, reasoning: null, trendPct: null,
    });
    expect(body.window).toMatchObject({ days: 30, recentDays: 7 });
  });

  it("same-listing drop: WAIT with basis + sample size", async () => {
    state.rows = Array.from({ length: 10 }, (_, i) => [
      { deal_id: `d${i}`, price: 20_000, observed_at: ago(20), deals: deal() },
      { deal_id: `d${i}`, price: 18_800, observed_at: ago(3), deals: deal() },
    ]).flat();
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({
      timing_signal: "WAIT", signal: "WAIT", confidence: "medium", basis: "same_listing",
      sampleSize: 10, data_points: 10, trendPct: -6, pct_change_30d: -6,
    });
    expect(body.reasoning).toMatch(/softening/);
  });

  it("price_history error degrades to no signal", async () => {
    state.error = { message: "boom" };
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ signal: null, confidence: "none" });
    expect(body.reason).toMatch(/unavailable/);
  });
});
