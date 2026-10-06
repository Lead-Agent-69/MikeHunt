// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rows = vi.hoisted(() => [
  {
    id: "comp",
    source: "craigslist",
    ask_price: 9000,
    sell_estimate: 12000,
    seconds_remaining: 3600,
    below_market_pct: 25,
    deal_analysis: { sellBasis: "comps", valuation: { source: "comparables" } },
  },
  {
    id: "ask",
    source: "craigslist",
    ask_price: 9000,
    sell_estimate: 10200,
    seconds_remaining: 3600,
    below_market_pct: 12,
    deal_analysis: { sellBasis: "market", valuation: { source: "asking_price" } },
  },
  {
    id: "base",
    source: "craigslist",
    ask_price: 9000,
    sell_estimate: 11000,
    seconds_remaining: 3600,
    below_market_pct: 18,
    deal_analysis: { sellBasis: "baseline", valuation: { source: "baseline" } },
  },
]);

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => {
    const c: any = {};
    for (const m of ["from", "select", "limit", "eq"]) c[m] = () => c;
    c.then = (r: any) => Promise.resolve({ data: rows, error: null }).then(r);
    return c;
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => false,
  listingsForDesk: (d: any[]) => d,
}));

import { GET } from "./route";

describe("GET /api/flash-deals honesty", () => {
  it("drops asking-price/baseline rows, nulls the countdown, private no-store", async () => {
    const res = await GET(new NextRequest("https://x.test/api/flash-deals"));
    const body = await res.json();
    expect(body.deals.map((d: any) => d.id)).toEqual(["comp"]);
    expect(body.deals[0].secondsRemaining).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
