import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const mode = vi.hoisted(() => ({ value: null as string | null }));
const NOW_ISO = new Date().toISOString();

const DEAL = {
  id: "d1",
  source: "cars_com",
  source_url: "https://example.com/1",
  title: "2018 Honda Accord",
  year: 2018,
  make: "Honda",
  model: "Accord",
  ask_price: 14500,
  sell_estimate: 17000,
  true_net_profit: 2100,
  profit_score: 80,
  recommended_max_bid: 13000,
  deal_verdict: "go",
  location_state: "TX",
  images: ["https://img.example/1.jpg"],
  first_seen_at: NOW_ISO,
};

function chain(rows: any[]) {
  const q: any = {};
  for (const m of ["select", "eq", "gt", "gte", "not", "order", "limit", "in"])
    q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  return q;
}

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) => {
      if (table === "user_preferences")
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  prefs: {
                    homeLocation: { state: "TX" },
                    buyerScope: { buyerMode: mode.value },
                  },
                },
              }),
            }),
          }),
        };
      if (table === "deal_signals")
        return chain([
          {
            deal_id: "s1",
            kind: "open",
            make: "Honda",
            model: "Accord",
            created_at: NOW_ISO,
          },
          {
            deal_id: "s2",
            kind: "save",
            make: "Honda",
            model: "Accord",
            created_at: NOW_ISO,
          },
        ]);
      return chain([DEAL]);
    },
  }),
}));

import { GET } from "./route";
const get = () => GET(new NextRequest("http://localhost/api/reco/for-you"));

describe("GET /api/reco/for-you", () => {
  it("guests get 401", async () => {
    getServerUser.mockResolvedValue({ data: { user: null } });
    expect((await get()).status).toBe(401);
  });

  it("ranks from signals and redacts flip economics off the flip desk", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mode.value = "personal";
    const res = await get();
    const body = await res.json();
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(body.personalized).toBe(true);
    expect(body.homeState).toBe("TX");
    expect(body.deskAccess).toBe("personal");
    expect(body.items[0]).toMatchObject({
      id: "d1",
      forYouReason: "You looked at 2 Honda Accord",
    });
    expect(body.items[0]).not.toHaveProperty("trueNetProfit");
    expect(body.items[0]).not.toHaveProperty("profitScore");
    expect(body.items[0]).not.toHaveProperty("recommendedMaxBid");
  });

  it("flip desk keeps economics", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mode.value = "reseller";
    const body = await (await get()).json();
    expect(body.deskAccess).toBe("flip");
    expect(body.items[0].trueNetProfit).toBe(2100);
  });
});
