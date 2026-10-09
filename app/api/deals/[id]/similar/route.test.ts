import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));
const queryRows = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as any,
  basePrice: 15000,
  filters: [] as { method: string; args: any[] }[],
}));

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    rpc,
    from: (table: string) => {
      const query: any = {
        maybeSingle: async () => ({
          data:
            table === "user_preferences" && savedMode.value
              ? { prefs: { buyerScope: { buyerMode: savedMode.value } } }
              : table === "deals"
                ? { ...ROW, id: "deal-1", ask_price: queryRows.basePrice }
                : null,
          error: null,
        }),
        then: (resolve: any) =>
          Promise.resolve({
            data: queryRows.rows,
            error: queryRows.error,
          }).then(resolve),
      };
      for (const method of [
        "select",
        "eq",
        "in",
        "neq",
        "gt",
        "gte",
        "lte",
        "order",
        "limit",
        "ilike",
        "or",
      ])
        query[method] = (...args: any[]) => {
          queryRows.filters.push({ method, args });
          return query;
        };
      return query;
    },
  }),
}));

import { GET } from "./route";

const ROW = {
  id: "deal-2",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  ask_price: 13900,
  mileage: 52000,
  condition: "clean",
  deal_verdict: "go",
  true_net_profit: 3300,
  sell_estimate: 17800,
  profit_score: 91,
  location_state: "TX",
  images: [],
  source: "independent_dealer",
  similarity: 0.93,
  active: true,
  last_seen_at: new Date().toISOString(),
};

async function load(mode: string | null, signedIn = true) {
  getServerUser.mockResolvedValue({
    data: { user: signedIn ? { id: "user-1" } : null },
    error: null,
  });
  savedMode.value = mode;
  const res = await GET(
    new NextRequest("https://app.test/api/deals/deal-1/similar"),
    { params: Promise.resolve({ id: "deal-1" }) },
  );
  expect(res.status).toBe(200);
  return (await res.json()).similar[0] as Record<string, any>;
}

describe("GET /api/deals/[id]/similar desk redaction", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [ROW], error: null });
    queryRows.rows = [ROW];
    queryRows.error = null;
    queryRows.basePrice = 15000;
    queryRows.filters = [];
  });

  it.each(["dealer", "reseller"])(
    "keeps net profit and score for a saved %s desk",
    async (mode) => {
      const card = await load(mode);
      expect(card.trueNetProfit).toBe(3300);
      expect(card.profitScore).toBe(91);
    },
  );

  it.each([
    ["personal", "personal", true],
    ["diy", "diy", true],
    ["parts", "parts", true],
    ["unknown", "fleet-manager", true],
    ["no saved mode", null, true],
    ["signed out", null, false],
  ] as const)("redacts profit for %s", async (_label, mode, signedIn) => {
    const card = await load(mode, signedIn);
    expect(card).not.toHaveProperty("trueNetProfit");
    expect(card).not.toHaveProperty("profitScore");
    expect(JSON.stringify(card)).not.toContain("3300");
    expect(card).toMatchObject({
      id: "deal-2",
      askPrice: 13900,
      sellEstimate: 17800,
      matchReasons: expect.arrayContaining([
        "Same make and model",
        "$1,100 lower asking price",
      ]),
    });
  });

  it("fails closed when the session lookup throws", async () => {
    getServerUser.mockRejectedValue(new Error("cookie parse"));
    savedMode.value = "dealer";
    const res = await GET(
      new NextRequest("https://app.test/api/deals/deal-1/similar"),
      { params: Promise.resolve({ id: "deal-1" }) },
    );
    const card = (await res.json()).similar[0];
    expect(card).not.toHaveProperty("trueNetProfit");
  });
  it("does not disguise inventory failures as an empty result", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    queryRows.error = { message: "offline" };
    const res = await GET(
      new NextRequest("https://app.test/api/deals/deal-1/similar"),
      { params: Promise.resolve({ id: "deal-1" }) },
    );
    expect(res.status).toBe(503);
  });
  it("rechecks semantic suggestions against live inventory", async () => {
    queryRows.rows = [{ ...ROW, active: false }];
    const res = await GET(
      new NextRequest("https://app.test/api/deals/deal-1/similar"),
      { params: Promise.resolve({ id: "deal-1" }) },
    );
    expect((await res.json()).similar).toEqual([]);
  });
  it("uses whole-dollar bounds for integer database prices", async () => {
    queryRows.basePrice = 24092;
    await load("personal");
    expect(queryRows.filters).toContainEqual({
      method: "gte",
      args: ["ask_price", 14456],
    });
    expect(queryRows.filters).toContainEqual({
      method: "lte",
      args: ["ask_price", 33728],
    });
  });
});
