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
  options: {},
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

const FLIP_LEAK_KEYS = [
  "profitEstimate",
  "profitScore",
  "recommendedMaxBid",
  "true_net_profit",
  "sellerPhone",
  "sellerEmail",
  "sellerContactUrl",
];

async function load(mode: string | null, signedIn = true, query = "state=TX") {
  getServerUser.mockResolvedValue({
    data: { user: signedIn ? { id: "user-1" } : null },
    error: null,
  });
  savedMode.value = mode;
  const res = await GET(new NextRequest(`https://app.test/api/scan?${query}`));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control") || "").toMatch(/private|no-store/i);
  const body = await res.json();
  return body;
}

describe("GET /api/scan desk redaction", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    savedMode.value = null;
    supa.configured = true;
  });

  it.each(["dealer", "reseller"])(
    "keeps profit and max-bid for a saved %s desk",
    async (mode) => {
      const body = await load(mode);
      expect(body.deskAccess).toBe("flip");
      const v = body.vehicles[0];
      expect(v.profitEstimate).toBe(2700);
      expect(v.recommendedMaxBid).toBe(11000);
      expect(v.true_net_profit).toBe(2700);
    },
  );

  it.each([
    ["personal", "personal", true],
    ["diy", "diy", true],
    ["parts", "parts", true],
    ["no saved mode", null, true],
    ["signed out", null, false],
  ] as const)(
    "strips profit, max-bid, and contact for %s",
    async (_label, mode, signedIn) => {
      const body = await load(mode, signedIn);
      expect(body.deskAccess).toBe("personal");
      const v = body.vehicles[0] as Record<string, any>;
      for (const key of FLIP_LEAK_KEYS) {
        expect(v).not.toHaveProperty(key);
      }
      expect(v.askPrice).toBe(12000);
      expect(v.sellEstimate).toBe(15500);
      // Nested analysis must not reintroduce profit / max-bid.
      expect(JSON.stringify(v.dealAnalysis || {})).not.toMatch(
        /2700|11000|recommendedMaxBid|"profit"/,
      );
      // Trust copy must not quote stripped flip economics.
      const trust = JSON.stringify(v.trustExplanation || {});
      expect(trust).not.toMatch(
        /estimated spread|recommended max buy|\$2,700|\$11,000/,
      );
      expect(JSON.stringify(v)).not.toContain("2700");
      expect(JSON.stringify(v)).not.toContain("11000");
    },
  );
});

describe("GET /api/scan desk-aware sort and empty responses", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    savedMode.value = null;
    supa.configured = true;
  });

  it.each([
    ["personal", "personal", true],
    ["parts", "parts", true],
    ["signed out", null, false],
  ] as const)(
    "serves trust ranking, not profit ranking, to %s",
    async (_label, mode, signedIn) => {
      const body = await load(mode, signedIn, "states=TX&sort=profit");
      expect(body.sort).toBe("score");
      expect(body.deskAccess).toBe("personal");
      expect(JSON.stringify(body.vehicles[0].trustExplanation)).not.toMatch(
        /Resale estimate|BUY verdict|max bid|resale and fee math/i,
      );
    },
  );

  it("keeps profit ranking for a saved dealer desk", async () => {
    const body = await load("dealer", true, "states=TX&sort=profit");
    expect(body.sort).toBe("profit");
    expect(body.deskAccess).toBe("flip");
  });

  it.each([
    ["guest (signed out)", null, false, "personal"],
    ["saved personal", "personal", true, "personal"],
    ["saved dealer", "dealer", true, "flip"],
  ] as const)(
    "always returns deskAccess on an empty unconfigured response: %s",
    async (_label, mode, signedIn, expected) => {
      supa.configured = false;
      const body = await load(mode, signedIn, "q=camry");
      expect(body.vehicles).toEqual([]);
      expect(body.deskAccess).toBe(expected);
    },
  );
});
