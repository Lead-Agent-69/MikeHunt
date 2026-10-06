import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));

const ROW = {
  id: "deal-9",
  source: "independent_dealer",
  source_url: "https://dealer.example/9",
  title: "2020 Honda Civic",
  year: 2020,
  make: "Honda",
  model: "Civic",
  ask_price: 15500,
  sell_estimate: 19000,
  true_net_profit: 2700,
  profit_score: 87,
  deal_verdict: "go",
  location_city: "Dallas",
  location_state: "TX",
  images: ["https://img.example/9.jpg"],
  mileage: 40000,
  condition: "clean",
  deal_analysis: { prediction: { daysToSell: 18, urgency: "act_now" } },
};

// Chainable query stub: every builder call returns itself; awaiting it yields the rows.
function query() {
  const q: any = {};
  for (const m of [
    "select",
    "eq",
    "gt",
    "not",
    "order",
    "limit",
    "range",
    "in",
  ])
    q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [ROW], error: null });
  return q;
}

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/cache", () => ({
  cached: (_k: string, _t: number, run: () => unknown) => run(),
}));
vi.mock("@/lib/intelligence/interest-profile", () => ({
  buildInterestProfile: async () => ({}),
}));
vi.mock("@/lib/intelligence/interest-patterns", () => ({
  scoreInterest: () => ({ affinity: 0, reason: "" }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) =>
      table === "user_preferences"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: savedMode.value
                    ? { prefs: { buyerScope: { buyerMode: savedMode.value } } }
                    : null,
                  error: null,
                }),
              }),
            }),
          }
        : query(),
  }),
}));

import { GET } from "./route";

async function load(mode: string | null, signedIn = true) {
  getServerUser.mockResolvedValue({
    data: { user: signedIn ? { id: "user-1" } : null },
    error: null,
  });
  savedMode.value = mode;
  const res = await GET(new NextRequest("https://app.test/api/feed"));
  expect(res.status).toBe(200);
  return (await res.json()).items[0] as Record<string, any>;
}

describe("GET /api/feed desk redaction", () => {
  beforeEach(() => getServerUser.mockReset());

  it.each(["dealer", "reseller"])(
    "keeps net profit and score for a saved %s desk",
    async (mode) => {
      const item = await load(mode);
      expect(item.netProfit).toBe(2700);
      expect(item.score).toBe(87);
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
    const item = await load(mode, signedIn);
    expect(item).not.toHaveProperty("netProfit");
    expect(item).not.toHaveProperty("score");
    expect(JSON.stringify(item)).not.toContain("2700");
    expect(item).toMatchObject({
      id: "deal-9",
      askPrice: 15500,
      sellEstimate: 19000,
    });
  });
});
