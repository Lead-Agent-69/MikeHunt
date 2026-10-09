import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.hoisted(() => vi.fn());
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: null as { id: string } | null } })),
);
const savedPrefs = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("@/lib/cache", () => ({
  cached: vi.fn((_key: string, _ttl: number, run: () => unknown) => run()),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  createServerComponentClient: vi.fn(() => ({
    rpc,
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data:
              table === "user_preferences" && savedPrefs.value
                ? { prefs: savedPrefs.value }
                : null,
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));

afterEach(() => {
  getServerUser.mockReset();
  getServerUser.mockImplementation(async () => ({ data: { user: null } }));
  savedPrefs.value = null;
});

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
  auction_end_at: new Date(Date.now() + 86400000).toISOString(),
  deal_analysis: {
    sellBasis: "market",
    soldAnchored: true,
    valuation: { compCount: 2, soldCount: 1 },
    costs: { repair: 1100, transport: 650 },
    warnings: ["Verify auction fees."],
  },
};

describe("GET /api/discover scoped feed contract", () => {
  it("excludes ended auctions from rails and coverage while keeping unknown closing times", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { ...baseRow, id: "ended", auction_end_at: "2020-01-01T00:00:00Z" },
        { ...baseRow, id: "open" },
        { ...baseRow, id: "unknown", auction_end_at: null },
      ],
      error: null,
    });
    const { GET } = await import("./route");
    const response = await GET(req("/api/discover?lane=government"));
    const body = await response.json();
    const ids = body.rails.flatMap((rail: any) =>
      rail.deals.map((deal: any) => deal.id),
    );
    expect(ids).not.toContain("ended");
    expect(ids).toContain("open");
    expect(ids).toContain("unknown");
    expect(body.totalListings).toBe(2);
    expect(body.marketListings).toBe(2);
  });
  it("keeps auctions out of ordinary discovery without losing dealer cars", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        baseRow,
        {
          ...baseRow,
          id: "dealer-car",
          source: "independent_dealer",
          source_url: "https://aeofmiami.com/product/1",
          condition: "salvage_title",
          seller_type: "dealer",
        },
      ],
      error: null,
    });
    const { GET } = await import("./route");
    const res = await GET(req("/api/discover"));
    const body = await res.json();
    const ids = body.rails.flatMap((rail: any) =>
      rail.deals.map((deal: any) => deal.id),
    );
    expect(body.totalListings).toBe(1);
    expect(body.marketListings).toBe(2);
    expect(ids).toContain("dealer-car");
    expect(ids).not.toContain("deal-1");
  }, 15_000);
  it.each([
    ["signed out", null, null, ["roi", "salvage", "auctionLots", "fresh"]],
    [
      "personal",
      "u-personal",
      "personal",
      ["roi", "salvage", "auctionLots", "fresh"],
    ],
    ["diy", "u-diy", "diy", ["roi", "salvage", "auctionLots", "fresh"]],
    ["parts", "u-parts", "parts", ["roi", "auctionLots", "fresh"]],
  ])(
    "never ships flip rails to a %s caller",
    async (_label, userId, buyerMode, hidden) => {
      rpc.mockResolvedValueOnce({ data: [baseRow], error: null });
      if (userId) {
        getServerUser.mockImplementation(async () => ({
          data: { user: { id: userId } },
        }));
        savedPrefs.value = { buyerScope: { buyerMode } };
      }
      const { GET } = await import("./route");
      const res = await GET(
        req("/api/discover?lane=government&sellerType=auction"),
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.deskAccess).toBe("personal");
      const keys = body.rails.map((rail: any) => rail.key);
      for (const key of hidden as string[]) expect(keys).not.toContain(key);
    },
    15_000,
  );

  // First import of the route is heavy under CI parallelism; 5s default flakes on Windows runners.
  it("returns a coverage block counted from real rows in the requested states", async () => {
    const now = Date.now();
    const iso = (hoursAgo: number) =>
      new Date(now - hoursAgo * 3_600_000).toISOString();
    rpc.mockResolvedValueOnce({
      data: [
        {
          ...baseRow,
          id: "mo-1",
          source: "curated_dealers",
          source_url: "https://dealer.example/1",
          condition: "clean",
          location_state: "MO",
          last_seen_at: iso(2),
        },
        {
          ...baseRow,
          id: "mo-gov",
          location_state: "MO",
          last_seen_at: iso(30),
        },
        {
          ...baseRow,
          id: "mo-old",
          source: "curated_dealers",
          source_url: "https://dealer.example/2",
          condition: "clean",
          location_state: "MO",
          last_seen_at: iso(24 * 10),
        },
      ],
      error: null,
    });
    const { GET } = await import("./route");
    const res = await GET(req("/api/discover?states=MO,IL"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith(
      "discover_deals",
      expect.objectContaining({ p_states: ["MO", "IL"], p_limit: 10000 }),
    );
    expect(body.coverage).toMatchObject({
      status: "thin",
      windowDays: 7,
      states: ["MO", "IL"],
      freshRows: 2,
      freshRowsInFeed: 1,
      sourceCount: 2,
      capped: false,
      byState: [
        { state: "MO", rows: 2 },
        { state: "IL", rows: 0 },
      ],
      thresholds: { minRows: 50, minSources: 2 },
    });
    expect(body.coverage.bySource.map((s: any) => [s.source, s.rows])).toEqual([
      ["curated_dealers", 1],
      ["gov_auction", 1],
    ]);
  });

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

    // A saved dealer desk receives the Auction Lots rail; non-flip desks never do (below).
    getServerUser.mockImplementation(async () => ({
      data: { user: { id: "dealer-1" } },
    }));
    savedPrefs.value = { buyerScope: { buyerMode: "dealer" } };

    const { GET } = await import("./route");
    const res = await GET(
      req("/api/discover?lane=government&sellerType=auction"),
    );
    const body = await res.json();
    const firstDeal = body.rails.flatMap((rail: any) => rail.deals)[0];

    expect(res.status).toBe(200);
    expect(body.totalListings).toBe(1);
    expect(body.sellerType).toBe("auction");
    expect(body.deskAccess).toBe("flip");
    expect(body.rails.map((rail: any) => rail.key)).toContain("auctionLots");
    expect(firstDeal).toMatchObject({
      id: "deal-1",
      source: "gov_auction",
      sellerType: "auction",
      repairEstimate: 1100,
      transportEstimate: 650,
    });
  }, 15_000);

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
    // Signed out: seller contact is redacted from the card, but quality still counts it as present.
    expect(aeDeal.sellerContactUrl).toBeUndefined();
    expect(aeDeal.sourceUrl).toBe(
      "https://aeofmiami.com/product/2023-gmc-terrain",
    );
    expect(aeDeal.dataQuality.missing).not.toContain("seller contact");
  });

  it("honors the makes query the buyer intent already sends", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          ...baseRow,
          id: "ford",
          source: "independent_dealer",
          source_url: "https://dealer.example/ford",
          seller_type: "dealer",
          condition: "clean",
          damage_type: null,
          make: "Ford",
          ask_price: 15000,
        },
        {
          ...baseRow,
          id: "honda",
          source: "independent_dealer",
          source_url: "https://dealer.example/honda",
          seller_type: "dealer",
          condition: "clean",
          damage_type: null,
          make: "Honda",
          ask_price: 14000,
        },
      ],
      error: null,
    });
    const { GET } = await import("./route");
    const res = await GET(
      req("/api/discover?makes=ford&state=TX&maxPrice=20000"),
    );
    const body = await res.json();
    const ids = body.rails.flatMap((rail: any) =>
      rail.deals.map((deal: any) => deal.id),
    );
    expect(res.status).toBe(200);
    expect(body.makes).toEqual(["ford"]);
    expect(ids).toContain("ford");
    expect(ids).not.toContain("honda");
  });

  describe("desk redaction", () => {
    const rows = () => [
      {
        ...baseRow,
        id: "flip-1",
        source: "independent_dealer",
        source_url: "https://aeofmiami.com/product/flip-1",
        seller_type: "dealer",
        condition: "clean",
        damage_type: null,
        ask_price: 9000,
        sell_estimate: 16000,
        true_net_profit: 4100,
        recommended_max_bid: 10400,
        profit_score: 95,
        options: {
          contact: { phone: "555-0199", email: "lot@aeofmiami.com" },
        },
      },
    ];
    const FLIP_KEYS = [
      "trueNetProfit",
      "recommendedMaxBid",
      "profitScore",
      "sellerPhone",
      "sellerEmail",
      "sellerContactUrl",
    ];

    async function load(mode: string | null, signedIn = true) {
      getServerUser.mockImplementation(async () => ({
        data: { user: signedIn ? { id: "user-1" } : null },
      }));
      savedPrefs.value = mode ? { buyerScope: { buyerMode: mode } } : null;
      rpc.mockResolvedValueOnce({ data: rows(), error: null });
      const { GET } = await import("./route");
      const res = await GET(req("/api/discover"));
      expect(res.status).toBe(200);
      return res.json();
    }

    it.each(["dealer", "reseller"])(
      "keeps flip economics and contact for a saved %s desk",
      async (mode) => {
        const body = await load(mode);
        const card = body.rails
          .flatMap((r: any) => r.deals)
          .find((d: any) => d.id === "flip-1");
        expect(body.deskAccess).toBe("flip");
        expect(card).toMatchObject({
          trueNetProfit: 4100,
          recommendedMaxBid: 10400,
          profitScore: 95,
          sellerPhone: "555-0199",
          sellerEmail: "lot@aeofmiami.com",
        });
      },
    );

    it.each([
      ["personal", "personal", true],
      ["diy", "diy", true],
      ["parts", "parts", true],
      ["unknown", "fleet-manager", true],
      ["no saved mode", null, true],
      ["signed out", null, false],
    ] as const)(
      "redacts cards and drops Top Flips for %s",
      async (_label, mode, signedIn) => {
        const body = await load(mode, signedIn);
        expect(body.deskAccess).toBe("personal");
        expect(body.rails.map((r: any) => r.key)).not.toContain("roi");
        const cards = body.rails.flatMap((r: any) => r.deals);
        expect(cards.length).toBeGreaterThan(0);
        for (const card of cards) {
          for (const key of FLIP_KEYS) expect(card).not.toHaveProperty(key);
        }
        const raw = JSON.stringify(body);
        expect(raw).not.toContain("555-0199");
        expect(raw).not.toContain("lot@aeofmiami.com");
        expect(raw).not.toContain("4100");
        expect(raw).not.toContain("10400");
        // Market value and the listing link stay for the buyer.
        expect(cards[0]).toMatchObject({
          id: "flip-1",
          askPrice: 9000,
          sellEstimate: 16000,
          sourceUrl: "https://aeofmiami.com/product/flip-1",
        });
      },
    );
  });
});
