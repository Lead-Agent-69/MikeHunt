import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const mode = vi.hoisted(() => ({ value: null as string | null }));
const signalsError = vi.hoisted(() => ({ value: null as any }));
const inventoryError = vi.hoisted(() => ({ value: null as any }));
const queryCalls = vi.hoisted(() => [] as Array<[string, ...any[]]>);
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

function chain(rows: any[], error: any = null) {
  const q: any = {};
  for (const m of [
    "select",
    "eq",
    "gt",
    "gte",
    "not",
    "order",
    "limit",
    "in",
    "is",
  ])
    q[m] = (...args: any[]) => {
      queryCalls.push([m, ...args]);
      return q;
    };
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: error ? null : rows, error });
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
        return chain(
          signalsError.value
            ? []
            : [
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
              ],
          signalsError.value,
        );
      return chain([DEAL], inventoryError.value);
    },
  }),
}));

import { GET } from "./route";
const get = () => GET(new NextRequest("http://localhost/api/reco/for-you"));

describe("GET /api/reco/for-you", () => {
  beforeEach(() => {
    signalsError.value = null;
    inventoryError.value = null;
    queryCalls.length = 0;
    mode.value = "personal";
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  });
  it("scopes candidates to the active search without overriding its location", async () => {
    const id = "bac11941-cbdf-414f-8a10-d272327e786b";
    await GET(new NextRequest(`http://localhost/api/reco/for-you?ids=${id}`));
    expect(queryCalls).toContainEqual(["in", "id", [id]]);
    expect(queryCalls).not.toContainEqual(["eq", "location_state", "TX"]);
  });
  it("empty or invalid eligible IDs never expand to the whole inventory", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/reco/for-you?ids=invalid"),
    );
    expect((await response.json()).items).toEqual([]);
    expect(queryCalls.some((call) => call[0] === "gt")).toBe(false);
  });
  it("transient signal failures are not presented as a cold start", async () => {
    signalsError.value = { code: "42501", message: "private failure" };
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private failure");
  });
  it("inventory failures are not presented as empty recommendations", async () => {
    inventoryError.value = { message: "private failure" };
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("guests get 401", async () => {
    getServerUser.mockResolvedValue({ data: { user: null } });
    expect((await get()).status).toBe(401);
  });

  it("ranks from signals and redacts flip economics off the flip desk", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mode.value = "personal";
    signalsError.value = null;
    const res = await get();
    const body = await res.json();
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(body.personalized).toBe(true);
    expect(body.signalsAvailable).toBe(true);
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
    signalsError.value = null;
    const body = await (await get()).json();
    expect(body.deskAccess).toBe("flip");
    expect(body.signalsAvailable).toBe(true);
    expect(body.items[0].trueNetProfit).toBe(2100);
  });

  it("missing deal_signals sets signalsAvailable:false (not a cold start)", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mode.value = "personal";
    signalsError.value = {
      code: "PGRST205",
      message:
        "Could not find the table 'public.deal_signals' in the schema cache",
    };
    const body = await (await get()).json();
    expect(body.personalized).toBe(false);
    expect(body.signalsAvailable).toBe(false);
    expect(body.basedOnSignals).toBe(0);
  });
});
