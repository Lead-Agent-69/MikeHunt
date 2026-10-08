import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  flip: true,
  size: 1105,
  error: null as null | { message: string },
  calls: [] as unknown[][],
}));
function query() {
  const q: any = {};
  let range = [0, 499];
  for (const method of [
    "select",
    "eq",
    "in",
    "or",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "neq",
    "is",
    "ilike",
    "order",
  ])
    q[method] = (...args: unknown[]) => {
      state.calls.push([method, ...args]);
      return q;
    };
  q.range = (from: number, to: number) => {
    range = [from, to];
    state.calls.push(["range", from, to]);
    return q;
  };
  q.then = (resolve: (value: unknown) => unknown) =>
    resolve({
      error: state.error,
      data: Array.from(
        { length: Math.max(0, Math.min(range[1] + 1, state.size) - range[0]) },
        (_, offset) => ({
          id: `car-${range[0] + offset}`,
          source: "copart",
          make: "Ford",
          model: "F-150",
          year: 2020,
          body_class: "Pickup",
          condition: "clean_title",
          location_state: "TX",
          seller_type: "auction",
          ask_price: 1000 + range[0] + offset,
          true_net_profit: 2500,
          profit_score: 80,
          sell_estimate: 15000,
          deal_verdict: "go",
          deal_analysis: { roi: 50 },
        }),
      ),
    });
  return q;
}
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: () => query() }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/deals/deal-desk-access", async (original) => ({
  ...(await original<object>()),
  resolveCallerFlipDesk: async () => state.flip,
}));
import { GET } from "./route";
import { invalidate } from "@/lib/cache";
const request = (search: string) =>
  GET(new NextRequest(`https://example.test/api/market/explore?${search}`));

describe("Market inventory filtering and pagination", () => {
  beforeEach(() => {
    invalidate();
    state.calls = [];
    state.size = 1105;
    state.flip = true;
    state.error = null;
  });

  it("reaches inventory beyond PostgREST's first 1000 rows", async () => {
    const response = await request(
      "mode=all&sort=askPrice&sortDir=asc&page=21",
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.total).toBe(1105);
    expect(body.rows).toHaveLength(50);
    expect(body.rows[0].id).toBe("car-1050");
    expect(body.capped).toBe(false);
    expect(state.calls).toContainEqual(["range", 1000, 1499]);
    expect(state.calls).toContainEqual(["order", "id", { ascending: true }]);
  });

  it("reuses the filtered dataset for subsequent result pages", async () => {
    await request("mode=all&sort=askPrice&sortDir=asc&page=0");
    const count = state.calls.length;
    const body = await (
      await request("mode=all&sort=askPrice&sortDir=asc&page=1")
    ).json();
    expect(body.rows[0].id).toBe("car-50");
    expect(state.calls).toHaveLength(count);
  });

  it("reports the bounded inventory sample honestly", async () => {
    state.size = 8001;
    const body = await (await request("mode=all")).json();
    expect(body.capped).toBe(true);
    expect(body.total).toBe(8000);
  });

  it("applies categories, provider URLs, and extended filters to the database", async () => {
    const response = await request(
      "mode=all&categories=trucks&sources=govdeals&runDrive=no&maxBuyNow=20000&auctionTo=2026-10-07&zip=78701&hasPhotos=yes",
    );
    expect(response.status).toBe(200);
    expect(state.calls).toContainEqual(["eq", "run_drive", false]);
    expect(state.calls).toContainEqual(["lte", "buy_now_price", 20000]);
    expect(state.calls).toContainEqual([
      "lt",
      "auction_end_at",
      "2026-10-08T00:00:00.000Z",
    ]);
    expect(state.calls).toContainEqual(["eq", "location_zip", "78701"]);
    expect(
      state.calls.some(
        (call) =>
          call[0] === "or" &&
          String(call[1]).includes("body_class.ilike.%pickup%"),
      ),
    ).toBe(true);
    expect(
      state.calls.some(
        (call) => call[0] === "or" && String(call[1]).includes("govdeals.com"),
      ),
    ).toBe(true);
  });

  it.each([
    "priceMin=500&priceMax=100",
    "minMileage=bad",
    "auctionFrom=2026-02-30",
    "categories=__proto__",
    "sources=unsupported",
  ])("rejects invalid filters before querying: %s", async (search) => {
    expect((await request(search)).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("keeps personal results independent of dealer-only intelligence gates", async () => {
    state.flip = false;
    const body = await (
      await request(
        "mode=curated&minProfit=999999&minRoi=999&verdicts=pass&sort=profitEstimate",
      )
    ).json();
    expect(body.mode).toBe("all");
    expect(body.total).toBe(1105);
    expect(body.deskAccess).toBe("personal");
    expect(body.rows[0]).not.toHaveProperty("profitEstimate");
    expect(body.facets.laneProfit).toEqual({});
    expect(state.calls).not.toContainEqual(["gte", "true_net_profit", 999999]);
    expect(state.calls.some((call) => call[1] === "deal_verdict")).toBe(false);
  });

  it("does not exclude unpriced inventory unless a price range is requested", async () => {
    await request("mode=all&q=Ford");
    expect(state.calls).not.toContainEqual(["gt", "ask_price", 0]);
    expect(
      state.calls.some(
        (call) =>
          call[0] === "or" && String(call[1]).includes("vin.ilike.%Ford%"),
      ),
    ).toBe(true);
    await request("mode=all&priceMax=20000");
    expect(state.calls).toContainEqual(["gt", "ask_price", 0]);
  });
});
