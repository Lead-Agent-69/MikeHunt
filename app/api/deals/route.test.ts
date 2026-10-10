// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const getDeals = vi.hoisted(() => vi.fn());
const getHotDeals = vi.hoisted(() => vi.fn());
const searchDeals = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/data/deals-service", () => ({
  DealsService: class {
    getDeals = getDeals;
    getHotDeals = getHotDeals;
    searchDeals = searchDeals;
  },
}));
vi.mock("@/lib/deals/deal-desk-access", async () => {
  const actual = await vi.importActual<any>("@/lib/deals/deal-desk-access");
  return { ...actual, resolveCallerFlipDesk: () => resolveFlip() };
});

import { GET, filtersForDesk, parseStates } from "./route";

const row = {
  id: "d1",
  title: "2018 Ford F-150",
  askPrice: 9000,
  sellEstimate: 12000,
  profitEstimate: 2500,
  profitScore: 80,
  trueNetProfit: 2100,
  recommendedMaxBid: 8700,
  contact: { phone: "555-0100" },
};

beforeEach(() => {
  resolveFlip.mockResolvedValue(false);
  getDeals.mockReset();
  getHotDeals.mockReset();
  searchDeals.mockReset();
  getDeals.mockResolvedValue({ deals: [row], total: 1, hasMore: false });
  getHotDeals.mockResolvedValue([row]);
  searchDeals.mockResolvedValue({ deals: [row], total: 1, hasMore: false });
});

describe("GET /api/deals desk gate", () => {
  it("signed-out / personal callers get no profit or seller contact", async () => {
    const res = await GET(new NextRequest("https://x.test/api/deals"));
    const body = await res.json();
    expect(body.deskAccess).toBe("personal");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const d = body.deals[0];
    expect(d.askPrice).toBe(9000);
    expect(d.sellEstimate).toBe(12000);
    for (const k of [
      "profitEstimate",
      "profitScore",
      "trueNetProfit",
      "recommendedMaxBid",
      "contact",
    ]) {
      expect(d).not.toHaveProperty(k);
    }
  });

  it("non-flip callers cannot filter or sort by profit", async () => {
    await GET(
      new NextRequest(
        "https://x.test/api/deals?minProfit=3000&minScore=70&sortBy=profitEstimate",
      ),
    );
    const filters = getDeals.mock.calls[0][0];
    expect(filters.minProfit).toBeUndefined();
    expect(filters.minScore).toBeUndefined();
    expect(filters.sortBy).toBe("lastSeenAt");
  });

  it("non-flip hot=true does not serve the profit-ranked hot list", async () => {
    await GET(new NextRequest("https://x.test/api/deals?hot=true"));
    expect(getHotDeals).not.toHaveBeenCalled();
    expect(getDeals).toHaveBeenCalled();
  });

  it("search is redacted too", async () => {
    const res = await GET(
      new NextRequest("https://x.test/api/deals?search=f150"),
    );
    const body = await res.json();
    expect(body.deals[0]).not.toHaveProperty("profitEstimate");
    expect(body.deals[0]).not.toHaveProperty("contact");
  });

  it("a saved reseller / dealer desk keeps flip economics and filters", async () => {
    resolveFlip.mockResolvedValue(true);
    const res = await GET(
      new NextRequest(
        "https://x.test/api/deals?minProfit=3000&sortBy=profitEstimate",
      ),
    );
    const body = await res.json();
    expect(body.deskAccess).toBe("flip");
    expect(body.deals[0].profitEstimate).toBe(2500);
    expect(body.deals[0].contact).toEqual({ phone: "555-0100" });
    expect(getDeals.mock.calls[0][0].minProfit).toBe(3000);
    expect(getDeals.mock.calls[0][0].sortBy).toBe("profitEstimate");
  });
});

describe("filtersForDesk", () => {
  it("keeps non-profit sorts for non-flip callers", () => {
    expect(
      filtersForDesk({ sortBy: "askPrice", sortOrder: "asc" }, false),
    ).toMatchObject({
      sortBy: "askPrice",
      sortOrder: "asc",
    });
  });

  it("passes an exact, validated state scope to the service", async () => {
    await GET(new NextRequest("https://x.test/api/deals?state=mo"));
    expect(getDeals.mock.calls[0][0].states).toEqual(["MO"]);
    getDeals.mockClear();
    await GET(
      new NextRequest(
        "https://x.test/api/deals?state=NATIONWIDE&states=ks,MO,xyz,1",
      ),
    );
    expect(getDeals.mock.calls[0][0].states).toEqual(["KS", "MO"]);
    getDeals.mockClear();
    await GET(new NextRequest("https://x.test/api/deals?state=Nationwide"));
    expect(getDeals.mock.calls[0][0].states).toBeUndefined();
  });

  it("parseStates de-dupes and ignores junk", () => {
    expect(parseStates(new URLSearchParams("state=MO&states=MO,mo"))).toEqual([
      "MO",
    ]);
    expect(parseStates(new URLSearchParams(""))).toBeUndefined();
  });
});
