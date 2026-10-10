import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const savedMode = vi.hoisted(() => ({ value: null as string | null }));
// Source deal for the hard prefilters (same segment, ±40% ask, ±3 years).
const BASE = vi.hoisted(() => ({
  make: "Toyota",
  model: "Camry",
  year: 2019,
  ask_price: 14500,
}));

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
const attrRows = vi.hoisted(() => ({ value: [] as any[] }));
const baseRow = vi.hoisted(() => ({ value: true }));
const rateLimit = vi.hoisted(() =>
  vi.fn(() => ({ allowed: true, remaining: 29, retryAfter: 0, limit: 30 })),
);
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  rateLimit,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    rpc,
    from: (table: string) => {
      // Chainable query stub: filters return the chain; maybeSingle → one row, limit → list.
      const chain: any = {};
      for (const m of [
        "select",
        "eq",
        "neq",
        "gt",
        "gte",
        "lte",
        "order",
        "ilike",
        "in",
      ])
        chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data:
          table === "user_preferences" && savedMode.value
            ? { prefs: { buyerScope: { buyerMode: savedMode.value } } }
            : table === "deals" && baseRow.value
              ? BASE
              : null,
        error: null,
      });
      chain.limit = async () => ({ data: attrRows.value, error: null });
      return chain;
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
    attrRows.value = [];
    baseRow.value = true;
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

describe("GET /api/deals/[id]/similar caching + rate limit", () => {
  const call = () =>
    GET(new NextRequest("https://app.test/api/deals/deal-1/similar"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

  beforeEach(() => {
    getServerUser.mockReset();
    getServerUser.mockResolvedValue({ data: { user: null }, error: null });
    savedMode.value = null;
    rpc.mockReset();
    rateLimit.mockClear();
    attrRows.value = [];
    baseRow.value = true;
  });

  it("rate-limits under the deal-similar key, 30 per 60s", async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });
    await call();
    expect(rateLimit).toHaveBeenCalledWith(expect.anything(), {
      key: "deal-similar",
      limit: 30,
      windowMs: 60_000,
    });
  });

  it("returns the standard 429 (no-store) without touching the database", async () => {
    rateLimit.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      retryAfter: 17,
      limit: 30,
    });
    const res = await call();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("semantic path is private, no-store", async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });
    const res = await call();
    expect((await res.json()).basis).toBe("semantic");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("attribute fallback is private, no-store", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    attrRows.value = [{ ...ROW, similarity: undefined }];
    const res = await call();
    expect((await res.json()).basis).toBe("attribute");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("none path is private, no-store", async () => {
    baseRow.value = false;
    const res = await call();
    expect(await res.json()).toEqual({ similar: [], basis: "none" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
