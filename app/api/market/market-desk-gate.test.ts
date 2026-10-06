// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from,
    rpc: async () => ({ data: [] }),
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: () => resolveFlip(),
}));

import { redactMarketOverviewForNonFlip } from "./overview/route";
import { GET as compareGET } from "./compare/route";

function chain(result: any) {
  const c: any = {};
  for (const m of [
    "select",
    "eq",
    "ilike",
    "gt",
    "gte",
    "lte",
    "order",
    "limit",
  ])
    c[m] = vi.fn(() => c);
  c.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

beforeEach(() => {
  resolveFlip.mockResolvedValue(false);
  from.mockReset();
  from.mockImplementation((table: string) =>
    table === "deals"
      ? chain({
          data: [
            {
              ask_price: 9000,
              true_net_profit: 2000,
              mileage: 80000,
              deal_verdict: "go",
              first_seen_at: null,
            },
          ],
        })
      : chain({ data: [] }),
  );
});

describe("market overview redaction", () => {
  it("drops every avgProfit for non-flip desks", () => {
    const out = redactMarketOverviewForNonFlip({
      make: "Ford",
      model: "F-150",
      stats: { goDeals: 2, avgProfit: 2500, totalActive: 10 },
      trims: [{ trim: "XLT", goDeals: 1, avgProfit: 3000, avgAsk: 20000 }],
      scatter: [{ mileage: 1, price: 2 }],
      regional: [
        { state: "TX", avgProfit: 4000, count: 1 },
        { state: "CA", avgProfit: 100, count: 5 },
      ],
    });
    expect(JSON.stringify(out)).not.toContain("avgProfit");
    expect(out.deskAccess).toBe("personal");
    expect(out.regional.map((r) => r.state)).toEqual(["CA", "TX"]);
    expect(out.trims[0].avgAsk).toBe(20000);
  });
});

describe("GET /api/market/compare desk gate", () => {
  it("non-flip comparison has no avgProfit", async () => {
    const res = await compareGET(
      new NextRequest(
        "https://x.test/api/market/compare?vehicles=Ford:F-150:2018",
      ),
    );
    const body = await res.json();
    expect(body.deskAccess).toBe("personal");
    expect(body.comparison[0].goDeals).toBe(1);
    expect(body.comparison[0]).not.toHaveProperty("avgProfit");
  });

  it("flip comparison keeps avgProfit", async () => {
    resolveFlip.mockResolvedValue(true);
    const res = await compareGET(
      new NextRequest(
        "https://x.test/api/market/compare?vehicles=Ford:F-150:2018",
      ),
    );
    const body = await res.json();
    expect(body.comparison[0].avgProfit).toBe(2000);
  });
});
