import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveCallerFlipDesk = vi.hoisted(() => vi.fn());
const rows = vi.hoisted(() => ({ value: [] as any[] }));

vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: { id: "u1" } } }),
}));
vi.mock("@/lib/supabase", () => {
  const q: any = {
    select: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    limit: async () => ({ data: rows.value, error: null }),
  };
  return {
    isSupabaseConfigured: () => true,
    createServerComponentClient: () => ({ from: () => q }),
  };
});
vi.mock("@/lib/deals/deal-desk-access", async (orig) => {
  const actual = await orig<typeof import("@/lib/deals/deal-desk-access")>();
  return { ...actual, resolveCallerFlipDesk };
});

import { GET } from "./route";

const saved = () => ({
  id: "s1",
  deal_id: "d1",
  status: "active",
  price_at_save: 9000,
  market_value_at_save: 12000,
  profit_at_save: 2100,
  snapshot: {
    year: 2018,
    make: "Honda",
    model: "Accord",
    askingPrice: 9000,
    marketValue: 12000,
    sellEstimate: 11800,
    estimatedProfit: 2100,
    recommendedMaxBid: 9600,
    repairEstimate: 400,
    transportEstimate: 250,
    profitScore: 77,
    sellerPhone: "5550100",
    sellerEmail: "seller@example.com",
    sellerContactUrl: "https://seller.example/contact",
    sourceUrl: "https://listing.example/1",
    trustExplanation: {
      confidence: "medium",
      reasons: ["VIN captured", "$2,100 estimated spread"],
      nextChecks: ["verify mileage", "validate resale and fee math"],
      summary: "VIN captured · $2,100 estimated spread",
    },
  },
});

const req = () => new NextRequest("http://localhost/api/saved-cars");

beforeEach(() => {
  resolveCallerFlipDesk.mockReset();
  rows.value = [saved()];
});

describe("GET /api/saved-cars desk redaction on read", () => {
  it("non-flip desk: no seller contact, profit, max bid, score, cost estimates or profit_at_save", async () => {
    resolveCallerFlipDesk.mockResolvedValue(false);
    const body = await (await GET(req())).json();
    const row = body[0];
    expect(row).not.toHaveProperty("profit_at_save");
    for (const k of [
      "sellerPhone",
      "sellerEmail",
      "sellerContactUrl",
      "estimatedProfit",
      "recommendedMaxBid",
      "repairEstimate",
      "transportEstimate",
      "profitScore",
    ]) {
      expect(row.snapshot).not.toHaveProperty(k);
    }
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("5550100");
    expect(raw).not.toContain("seller@example.com");
    expect(raw).not.toMatch(/spread|fee math/);
    // Market value and the listing itself stay.
    expect(row.snapshot.sellEstimate).toBe(11800);
    expect(row.snapshot.marketValue).toBe(12000);
    expect(row.snapshot.sourceUrl).toBe("https://listing.example/1");
    expect(row.snapshot.trustExplanation.reasons).toEqual(["VIN captured"]);
    expect(row.snapshot.trustExplanation.summary).toBe("VIN captured");
    expect(row.deskAccess).toBe("personal");
  });

  it("flip desk: snapshot comes back intact", async () => {
    resolveCallerFlipDesk.mockResolvedValue(true);
    const body = await (await GET(req())).json();
    expect(body[0]).toEqual(saved());
  });

  it("resolves the desk once per request, not per row", async () => {
    resolveCallerFlipDesk.mockResolvedValue(false);
    rows.value = [saved(), { ...saved(), id: "s2" }, { ...saved(), id: "s3" }];
    await GET(req());
    expect(resolveCallerFlipDesk).toHaveBeenCalledTimes(1);
  });
});
