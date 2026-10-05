import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const getDealById = vi.hoisted(() => vi.fn());
const prefsMaybeSingle = vi.hoisted(() => vi.fn());
const fromTable = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/data/deals-service", () => ({
  DealsService: class {
    getDealById = getDealById;
  },
}));
vi.mock("@/lib/auth/plan", () => ({
  getUserPlan: vi.fn(async () => "free"),
  meterDealView: vi.fn(async () => ({
    allowed: true,
    remaining: Infinity,
    limit: Infinity,
    plan: "free",
  })),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) => {
      fromTable(table);
      return {
        select: () => ({
          eq: () => ({ maybeSingle: prefsMaybeSingle }),
        }),
      };
    },
  }),
}));

import { GET } from "./route";

const FULL_DEAL = {
  id: "deal-1",
  source: "independent_dealer",
  title: "2018 Toyota Camry",
  year: 2018,
  make: "Toyota",
  model: "Camry",
  vin: "4T1B11HK5JU000000",
  mileage: 61000,
  condition: "clean",
  askPrice: 14500,
  mmrValue: 17100,
  profitEstimate: 2100,
  profitScore: 88,
  images: ["https://img.example/1.jpg"],
  locationState: "TX",
  sourceUrl: "https://dealer.example/listing/1",
  contact: {
    phone: "555-0100",
    email: "sales@dealer.example",
    url: "https://dealer.example",
    listingUrl: "https://dealer.example/listing/1",
  },
  true_net_profit: 1875,
  ai_wholesale_estimate: 15000,
  ai_retail_estimate: 18200,
  ai_rationale: "Margin after recon",
  is_arbitrage_opportunity: true,
  sellEstimate: 18200,
  recommendedMaxBid: 15100,
  dealVerdict: "hold",
  dealAnalysis: {
    roi: 12.4,
    profitMargin: 0.1,
    breakEvenDay: 21,
    sellBasis: "comps",
    soldAnchored: true,
    costs: {
      acquisition: 14500,
      repair: 600,
      transport: 350,
      holding: 400,
      selling: 475,
      total: 16325,
    },
    scoreBreakdown: { profit: 40 },
    prediction: { horizonDays: 30, expectedSell: 18000 },
    valuation: { basis: "comps", soldAnchored: true },
    warnings: ["thin margin"],
    recommendations: ["bid under 15.1k"],
  },
};

function signedIn(userId: string | null) {
  getServerUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function savedMode(mode: unknown) {
  prefsMaybeSingle.mockResolvedValue({
    data:
      mode === undefined
        ? { prefs: {} }
        : { prefs: { buyerScope: { buyerMode: mode } } },
    error: null,
  });
}

async function load() {
  const res = await GET(
    new NextRequest("https://app.test/api/deals/deal-1?dealerId=d-1"),
    { params: Promise.resolve({ id: "deal-1" }) },
  );
  expect(res.status).toBe(200);
  return (await res.json()).deal as Record<string, any>;
}

const FLIP_KEYS = [
  "true_net_profit",
  "trueNetProfit",
  "profitEstimate",
  "profitScore",
  "recommendedMaxBid",
  "sellEstimate",
  "mmrValue",
  "dealVerdict",
  "ai_wholesale_estimate",
  "ai_retail_estimate",
  "ai_rationale",
  "is_arbitrage_opportunity",
  "contact",
];

function expectRedacted(deal: Record<string, any>) {
  for (const key of FLIP_KEYS) expect(deal).not.toHaveProperty(key);
  // Only buyer-facing repair / transport survive from the analysis blob.
  expect(deal.dealAnalysis).toEqual({ costs: { repair: 600, transport: 350 } });
  const raw = JSON.stringify(deal);
  expect(raw).not.toContain("555-0100");
  expect(raw).not.toContain("sales@dealer.example");
  expect(raw).not.toContain("1875");
  expect(raw).not.toContain("roi");
  expect(raw).not.toContain("prediction");
  expect(raw).not.toContain("valuation");
  expect(deal.deskAccess).toBe("personal");
  // The listing itself is still there for the verify-list desk.
  expect(deal).toMatchObject({
    id: "deal-1",
    year: 2018,
    make: "Toyota",
    model: "Camry",
    askPrice: 14500,
    sourceUrl: "https://dealer.example/listing/1",
  });
  expect(deal.decisionEvidence).toBeTruthy();
}

describe("GET /api/deals/[id] desk redaction", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    getDealById.mockReset();
    prefsMaybeSingle.mockReset();
    fromTable.mockReset();
    getDealById.mockResolvedValue(structuredClone(FULL_DEAL));
  });

  it.each(["dealer", "reseller", "dealer-team", "independent-reseller"])(
    "sends the full flip payload to a saved %s desk",
    async (mode) => {
      signedIn("user-dealer");
      savedMode(mode);
      const deal = await load();
      expect(fromTable).toHaveBeenCalledWith("user_preferences");
      expect(deal.deskAccess).toBe("flip");
      expect(deal.true_net_profit).toBe(1875);
      expect(deal.recommendedMaxBid).toBe(15100);
      expect(deal.sellEstimate).toBe(18200);
      expect(deal.contact).toEqual(FULL_DEAL.contact);
      expect(deal.dealAnalysis.roi).toBe(12.4);
      expect(deal.dealAnalysis.costs).toEqual(FULL_DEAL.dealAnalysis.costs);
      expect(deal.dealAnalysis.prediction).toEqual(
        FULL_DEAL.dealAnalysis.prediction,
      );
      expect(deal.dealAnalysis.valuation).toEqual(
        FULL_DEAL.dealAnalysis.valuation,
      );
    },
  );

  it.each([
    ["personal", "personal"],
    ["diy", "diy"],
    ["parts", "parts"],
    ["unknown mode", "fleet-manager"],
    ["no saved mode", undefined],
  ])("redacts flip fields for a %s session", async (_label, mode) => {
    signedIn("user-a");
    savedMode(mode);
    expectRedacted(await load());
  });

  it("redacts when there is no preferences row", async () => {
    signedIn("user-a");
    prefsMaybeSingle.mockResolvedValue({ data: null, error: null });
    expectRedacted(await load());
  });

  it("fails closed when the preferences read errors", async () => {
    signedIn("user-a");
    prefsMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    expectRedacted(await load());
  });

  it("fails closed when the preferences read throws", async () => {
    signedIn("user-a");
    prefsMaybeSingle.mockRejectedValue(new Error("network"));
    expectRedacted(await load());
  });

  it("redacts for a signed-out caller and never reads preferences", async () => {
    signedIn(null);
    expectRedacted(await load());
    expect(fromTable).not.toHaveBeenCalled();
  });

  it("fails closed when the session lookup throws", async () => {
    getServerUser.mockRejectedValue(new Error("cookie parse"));
    expectRedacted(await load());
  });
});
