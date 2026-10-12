import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ rows: [] as any[], calls: [] as string[] }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => {
      const query: any = {};
      for (const method of [
        "select",
        "eq",
        "gte",
        "gt",
        "not",
        "limit",
        "order",
        "lte",
        "ilike",
        "in",
        "or",
      ])
        query[method] = () => {
          state.calls.push(method);
          return query;
        };
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(resolve);
      return query;
    },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/deals/deal-desk-access", async (original) => ({
  ...(await original<typeof import("@/lib/deals/deal-desk-access")>()),
  resolveCallerFlipDesk: async () => true,
}));
import { GET } from "./route";

const car = {
  id: "example",
  source: "cars_com",
  year: 2018,
  make: "Ford",
  model: "Edge",
  ask_price: 15000,
  sell_estimate: 20000,
  true_net_profit: 3000,
  profit_score: 80,
  deal_verdict: "go",
  location_state: "MO",
  images: [],
};
beforeEach(() => {
  state.rows = [];
  state.calls = [];
});
describe("best-buy price integrity", () => {
  it.each([
    { source: "craigslist_dealer", ask_price: 3000 },
    {
      options: { priceEvidence: { kind: "down_payment", listedAmount: 3000 } },
    },
    {
      source: "ebay_motors",
      options: { priceEvidence: { kind: "current_bid", currentBid: 3000 } },
    },
  ])(
    "does not rank a teaser or current bid as the best purchase",
    async (terms) => {
      state.rows = [{ ...car, true_net_profit: 30000, ...terms }];
      const result = await (
        await GET(
          new NextRequest(
            "https://example.com/api/deals/best-buy?lane=auction",
          ),
        )
      ).json();
      expect(result.bestBuy).toBeNull();
      expect(result.stats.maxProfit).toBe(0);
    },
  );
  it("retains an ordinary priced vehicle as a research candidate", async () => {
    state.rows = [car];
    const result = await (
      await GET(new NextRequest("https://example.com/api/deals/best-buy"))
    ).json();
    expect(result.bestBuy?.id).toBe("example");
    expect(result.bestBuy?.askPrice).toBe(15000);
    expect(result.bestBuy?.opportunityMode).toBe("watchlist");
    expect(state.calls.indexOf("or")).toBeLessThan(
      state.calls.indexOf("limit"),
    );
  });
});
