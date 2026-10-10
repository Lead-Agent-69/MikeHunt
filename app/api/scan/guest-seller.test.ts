// Seller names never reach signed-out guests on /api/scan cards.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));
const supa = vi.hoisted(() => ({ configured: true }));

const ROW = {
  id: "scan-1",
  source: "craigslist",
  source_url: "https://craigslist.org/1",
  title: "2019 Toyota Camry",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  ask_price: 12000,
  sell_estimate: 15500,
  mmr_value: 15000,
  true_net_profit: 2700,
  profit_estimate: 2700,
  profit_score: 88,
  recommended_max_bid: 11000,
  deal_verdict: "go",
  location_city: "Austin",
  location_state: "TX",
  images: ["https://img.example/1.jpg"],
  mileage: 52000,
  condition: "clean",
  seller: "Jane Q. Private",
  options: { seller: "Jane Q. Private", sellerType: "private" },
  deal_analysis: {
    profit: 2700,
    recommendedMaxBid: 11000,
    costs: { repair: 400, transport: 250, selling: 300 },
    valuation: { basis: "comps", compCount: 4 },
  },
};

function query() {
  const q: any = {};
  for (const m of [
    "select",
    "eq",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "or",
    "ilike",
    "order",
    "limit",
    "range",
    "in",
  ])
    q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [ROW], count: 1, error: null });
  return q;
}

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => supa.configured,
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
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => query(),
  }),
}));

import { GET } from "./route";

async function vehicle(signedIn: boolean, mode: string | null = null) {
  getServerUser.mockResolvedValue({
    data: { user: signedIn ? { id: "user-1" } : null },
    error: null,
  });
  savedMode.value = mode;
  const res = await GET(new NextRequest("https://app.test/api/scan?state=TX"));
  expect(res.status).toBe(200);
  return (await res.json()).vehicles[0] as Record<string, any>;
}

describe("GET /api/scan seller identity for guests", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    savedMode.value = null;
    supa.configured = true;
  });

  it("a signed-out guest gets no seller name on the card", async () => {
    const v = await vehicle(false);
    expect(JSON.stringify(v)).not.toContain("Jane Q. Private");
    expect(v.seller).toBeUndefined();
  });

  it("a session lookup failure counts as a guest (fail closed)", async () => {
    getServerUser.mockReset();
    getServerUser.mockRejectedValue(new Error("auth down"));
    const res = await GET(
      new NextRequest("https://app.test/api/scan?state=TX"),
    );
    const v = (await res.json()).vehicles[0];
    expect(JSON.stringify(v)).not.toContain("Jane Q. Private");
  });

  it.each([
    ["personal", "personal"],
    ["dealer", "dealer"],
  ])("a signed-in %s desk keeps the seller name", async (_l, mode) => {
    const v = await vehicle(true, mode);
    expect(JSON.stringify(v)).toContain("Jane Q. Private");
  });
});
