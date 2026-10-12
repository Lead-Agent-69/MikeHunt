import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  deals: [] as Record<string, unknown>[],
  searches: [] as Record<string, unknown>[],
  filters: [] as unknown[][],
}));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: () => true }));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => {
      const data =
        table === "deals"
          ? state.deals
          : table === "user_saved_searches"
            ? state.searches
            : [];
      const query = {
        select: () => query,
        order: () => query,
        gt: () => query,
        limit: () => query,
        in: () => query,
        eq: (field: string, value: unknown) => {
          state.filters.push([table, field, value]);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    },
  }),
}));
import { GET } from "./route";
const car = {
  id: "car",
  make: "Honda",
  model: "Civic",
  year: 2021,
  location_state: "MO",
  source: "independent_dealer",
  condition: "clean_title",
  ask_price: 10000,
  true_net_profit: 5000,
  deal_verdict: "go",
  options: {},
};
beforeEach(() => {
  state.deals = [car];
  state.searches = [];
  state.filters = [];
});
async function evaluate(search: Record<string, unknown>) {
  state.searches = [
    {
      id: "search",
      user_id: "owner",
      notify_email: true,
      is_active: true,
      ...search,
    },
  ];
  return (
    await GET(new NextRequest("https://example.test/api/alerts/profit-sniper"))
  ).json();
}
describe("profit-sniper saved criteria", () => {
  it("uses the actual stored state field", async () => {
    expect((await evaluate({ state: "FL" })).matchedAlertsCount).toBe(0);
    expect(
      (await evaluate({ state: "MO", model: "Civic", title_type: "clean" }))
        .matchedAlertsCount,
    ).toBe(1);
    expect(state.filters).toContainEqual([
      "user_saved_searches",
      "is_active",
      true,
    ]);
  });
  it.each([
    { model: "Accord" },
    { title_type: "salvage" },
    { is_active: false },
    { max_price: 9000 },
    { lane: "damaged" },
    { seller_type: "private" },
    { max_distance_miles: 50 },
  ])("does not emit out-of-scope candidates: %j", async (search) => {
    expect((await evaluate(search)).matchedAlertsCount).toBe(0);
  });
});
