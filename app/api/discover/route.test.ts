import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache", () => ({
  cached: vi.fn((_key: string, _ttl: number, run: () => unknown) => run()),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  createServerComponentClient: vi.fn(() => ({
    rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/server-supabase", () => ({
  getServerUser: vi.fn(async () => ({ data: { user: null } })),
}));

function req(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

const baseRow = {
  id: "deal-1",
  source: "gov_auction",
  source_url: "https://govdeals.com/asset/1",
  title: "2018 Ford F-150 Fleet Truck",
  year: 2018,
  make: "Ford",
  model: "F-150",
  vin: null,
  mileage: 98000,
  condition: "salvage",
  damage_type: "fleet",
  seller_type: null,
  seller: "GovDeals",
  ask_price: 7200,
  sell_estimate: 14500,
  true_net_profit: 2500,
  recommended_max_bid: 8200,
  deal_verdict: "go",
  profit_score: 82,
  repair_estimate: 1100,
  transport_cost: 650,
  location_city: "Austin",
  location_state: "TX",
  images: ["https://example.com/truck.jpg"],
  first_seen_at: "2026-10-02T00:00:00.000Z",
  last_seen_at: "2026-10-02T04:00:00.000Z",
  auction_end_at: "2026-10-05T04:00:00.000Z",
  deal_analysis: {
    sellBasis: "market",
    soldAnchored: true,
    valuation: { compCount: 2, soldCount: 1 },
    costs: { repair: 1100, transport: 650 },
    warnings: ["Verify auction fees."],
  },
};

describe("GET /api/discover scoped feed contract", () => {
  it("keeps gov_auction government rows and maps trust/cost fields", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        baseRow,
        {
          ...baseRow,
          id: "deal-2",
          source: "independent_dealer",
          source_url: "https://aeofmiami.com/product/1",
          seller_type: "dealer",
        },
      ],
      error: null,
    });

    const { GET } = await import("./route");
    const res = await GET(
      req("/api/discover?lane=government&sellerType=auction"),
    );
    const body = await res.json();
    const firstDeal = body.rails.flatMap((rail: any) => rail.deals)[0];

    expect(res.status).toBe(200);
    expect(body.totalListings).toBe(1);
    expect(body.sellerType).toBe("auction");
    expect(body.rails.map((rail: any) => rail.key)).toContain("auctionLots");
    expect(firstDeal).toMatchObject({
      id: "deal-1",
      source: "gov_auction",
      sellerType: "auction",
      repairEstimate: 1100,
      transportEstimate: 650,
    });
  });

  it("honors title, min price, max price, and selected dealer scope", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          ...baseRow,
          id: "ae-1",
          source: "independent_dealer",
          source_url: "https://aeofmiami.com/product/2023-gmc-terrain",
          seller_type: "dealer",
          seller: "AE of Miami",
          title: "2023 GMC Terrain SUV",
          make: "GMC",
          model: "Terrain",
          condition: "salvage_title",
          damage_type: "Salvage",
          ask_price: 5990,
          location_state: "FL",
        },
        {
          ...baseRow,
          id: "ae-too-cheap",
          source: "independent_dealer",
          source_url: "https://aeofmiami.com/product/cheap",
          seller_type: "dealer",
          condition: "salvage_title",
          damage_type: "Salvage",
          ask_price: 4200,
          location_state: "FL",
        },
        {
          ...baseRow,
          id: "wrong-dealer",
          source: "independent_dealer",
          source_url: "https://stjamesautoparts.com/inventory/1",
          seller_type: "dealer",
          condition: "salvage_title",
          damage_type: "Salvage",
          ask_price: 6500,
          location_state: "FL",
        },
      ],
      error: null,
    });

    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/discover?lane=damaged&state=FL&titleType=salvage&sellerType=dealer&minPrice=5000&maxPrice=10000&dealerSourceIds=ae-of-miami",
      ),
    );
    const body = await res.json();
    const ids = body.rails.flatMap((rail: any) =>
      rail.deals.map((deal: any) => deal.id),
    );

    expect(res.status).toBe(200);
    expect(body.totalListings).toBe(1);
    expect(body.titleType).toBe("salvage");
    expect(body.minPrice).toBe(5000);
    expect(body.maxPrice).toBe(10000);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami"]);
    expect(ids).toContain("ae-1");
    expect(ids).not.toContain("ae-too-cheap");
    expect(ids).not.toContain("wrong-dealer");
    const aeDeal = body.rails
      .flatMap((rail: any) => rail.deals)
      .find((deal: any) => deal.id === "ae-1");
    expect(aeDeal.sellerContactUrl).toBe(
      "https://aeofmiami.com/product/2023-gmc-terrain",
    );
    expect(aeDeal.dataQuality.missing).not.toContain("seller contact");
  });
});
