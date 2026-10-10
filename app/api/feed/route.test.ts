import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  error: null as unknown,
  rows: [] as any[],
  cacheKeys: [] as string[],
}));

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
    "neq",
    "order",
    "limit",
    "range",
    "in",
    "is",
    "or",
    "ilike",
    "gte",
    "lte",
    "lt",
  ])
    q[m] = (...args: unknown[]) => {
      db.calls.push([m, ...args]);
      return q;
    };
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: db.rows, error: db.error });
  return q;
}

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/cache", () => ({
  cached: (key: string, _t: number, run: () => unknown) => {
    db.cacheKeys.push(key);
    return run();
  },
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
  beforeEach(() => {
    getServerUser.mockReset();
    db.calls = [];
    db.error = null;
    db.rows = [ROW];
    db.cacheKeys = [];
  });

  it("returns a retryable error rather than an empty personalized feed after a failed inventory read", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    savedMode.value = "personal";
    db.error = { message: "private database detail" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(new NextRequest("https://app.test/api/feed"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private database detail");
    spy.mockRestore();
  });

  it("applies shared details before ranking and scopes cache keys by filters and desk", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    savedMode.value = "personal";
    const response = await GET(
      new NextRequest(
        "https://app.test/api/feed?state=TX&runDrive=unknown&maxPrice=20000&sources=govdeals",
      ),
    );
    expect(response.status).toBe(200);
    expect(db.calls).toContainEqual(["eq", "location_state", "TX"]);
    expect(db.calls).toContainEqual(["is", "run_drive", null]);
    expect(db.calls).toContainEqual(["lte", "ask_price", 20000]);
    expect(db.cacheKeys[0]).toContain(":personal:");
    expect(db.cacheKeys[0]).toContain("runDrive=unknown");
    expect(
      db.calls.some(
        (call) => call[0] === "order" && call[1] === "profit_score",
      ),
    ).toBe(false);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not rank personal matches by resale profit score", async () => {
    db.rows = [
      { ...ROW, id: "first", profit_score: 1 },
      { ...ROW, id: "second", profit_score: 100 },
    ];
    getServerUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    savedMode.value = "personal";
    const body = await (
      await GET(new NextRequest("https://app.test/api/feed"))
    ).json();
    expect(body.items.map((item: any) => item.id)).toEqual(["first", "second"]);
    expect(body.boundedPool).toBe(true);
  });

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
