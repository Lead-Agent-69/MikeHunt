import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "user_preferences" && savedMode.value
                ? { prefs: { buyerScope: { buyerMode: savedMode.value } } }
                : null,
            error: null,
          }),
        }),
      }),
    }),
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
      similarity: 93,
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
});
