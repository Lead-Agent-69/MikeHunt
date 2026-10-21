import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  flip: true,
  size: 1105,
  error: null as null | { message: string },
  calls: [] as unknown[][],
  rows: null as Record<string, any>[] | null,
  center: { lat: 38.63, lng: -90.2 } as { lat: number; lng: number } | null,
}));
function query() {
  const q: any = {};
  let range = [0, 499];
  for (const method of [
    "select",
    "eq",
    "in",
    "or",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "neq",
    "is",
    "ilike",
    "order",
  ])
    q[method] = (...args: unknown[]) => {
      state.calls.push([method, ...args]);
      return q;
    };
  q.range = (from: number, to: number) => {
    range = [from, to];
    state.calls.push(["range", from, to]);
    return q;
  };
  q.then = (resolve: (value: unknown) => unknown) =>
    resolve({
      error: state.error,
      data: state.rows
        ? state.rows.slice(range[0], range[1] + 1)
        : Array.from(
            {
              length: Math.max(
                0,
                Math.min(range[1] + 1, state.size) - range[0],
              ),
            },
            (_, offset) => ({
              id: `car-${range[0] + offset}`,
              source: "copart",
              make: "Ford",
              model: "F-150",
              year: 2020,
              body_class: "Pickup",
              condition: "clean_title",
              location_state: "TX",
              seller_type: "auction",
              ask_price: 1000 + range[0] + offset,
              true_net_profit: 2500,
              profit_score: 80,
              sell_estimate: 15000,
              deal_verdict: "go",
              deal_analysis: { roi: 50 },
            }),
          ),
    });
  return q;
}
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: () => query() }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/geo/geocode", () => ({ geocodeZip: async () => state.center }));
vi.mock("@/lib/deals/deal-desk-access", async (original) => ({
  ...(await original<object>()),
  resolveCallerFlipDesk: async () => state.flip,
}));
import { GET } from "./route";
import { invalidate } from "@/lib/cache";
const request = (search: string) => {
  // General filter fixtures intentionally include incomplete records for explicit research.
  const params = new URLSearchParams(search);
  if (!params.has("hasPhotos")) params.set("hasPhotos", "any");
  return GET(
    new NextRequest(`https://example.test/api/market/explore?${params}`),
  );
};

describe("Market inventory filtering and pagination", () => {
  it("defaults to usable vehicle photos before counts and pagination", async () => {
    const base = {
      year: 2024,
      make: "Buick",
      model: "Envista",
      source: "independent_dealer",
      ask_price: 20000,
    };
    state.rows = [
      { ...base, id: "vehicle", images: ["https://dealer.test/car.jpg"] },
      { ...base, id: "missing", images: [] },
      { ...base, id: "logo", images: ["https://dealer.test/images/logo.png"] },
      {
        ...base,
        id: "unavailable",
        images: ["https://dealer.test/dead.jpg"],
        photo_state: "unavailable",
      },
    ];
    const body = await (
      await GET(
        new NextRequest("https://example.test/api/market/explore?pageSize=1"),
      )
    ).json();
    expect(body.total).toBe(1);
    expect(body.rows.map((row: any) => row.id)).toEqual(["vehicle"]);
    const research = await (await request("hasPhotos=any")).json();
    expect(research.total).toBe(4);
  });
  it("rejects an invalid photo filter rather than silently including missing photos", async () => {
    expect((await request("hasPhotos=invalid")).status).toBe(400);
  });
  it("does not publish resale or profit claims for conflicting vehicle identities", async () => {
    state.rows = [
      {
        id: "conflicting",
        title: "2024 Buick Allure Sport Touring",
        year: 2024,
        make: "Buick",
        model: "Envista",
        source: "independent_dealer",
        source_url: "https://dealer.test/car",
        ask_price: 20000,
        sell_estimate: 25000,
        true_net_profit: 4000,
        profit_score: 90,
        deal_verdict: "go",
        last_seen_at: new Date().toISOString(),
        price_evidence: { kind: "asking", askingPrice: 20000 },
        deal_analysis: {
          valuation: {
            source: "comparables",
            resaleEvidence: true,
            compCount: 5,
            confidence: "medium",
            compKind: "ask",
          },
        },
      },
    ];
    const body = await (await request("sort=profitScore")).json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].valuationEvidence).toEqual({
      label: "Vehicle identity needs verification",
      supported: false,
    });
    for (const field of [
      "sellEstimate",
      "profitEstimate",
      "profitScore",
      "priceGap",
      "recommendedMaxBid",
      "dealVerdict",
    ])
      expect(body.rows[0][field]).toBeUndefined();
  });
  it("keeps unknown-title and no-repair constraints instead of broadening a shared search", async () => {
    const response = await request("titleType=unknown&includeRepairable=0");
    expect(response.status).toBe(200);
    expect(state.calls).toContainEqual([
      "or",
      "condition.in.(run_drive,flood,fire,hail),condition.is.null",
    ]);
    expect(state.calls).toContainEqual([
      "or",
      "condition.is.null,condition.in.(clean_title,run_drive)",
    ]);
  });
  it("sorts a qualified asking-price gap separately from net profit and places unsupported prices last", async () => {
    const listing = {
      source: "independent_dealer",
      source_url: "https://dealer.example/vehicle/123",
      ask_price: 10000,
      sell_estimate: 20000,
      last_seen_at: new Date().toISOString(),
      price_evidence: { kind: "asking", askingPrice: 10000 },
      deal_analysis: {
        valuation: {
          resaleEvidence: true,
          source: "comparables",
          compCount: 5,
          compKind: "ask",
          confidence: "medium",
        },
      },
    };
    state.rows = [
      {
        ...listing,
        id: "low-gap",
        sell_estimate: 12000,
        true_net_profit: 9000,
      },
      { ...listing, id: "high-gap", true_net_profit: 100 },
      { ...listing, id: "unverified", price_evidence: { kind: "unknown" } },
    ];
    const body = await (await request("sort=priceGap&sortDir=desc")).json();
    expect(body.rows.map((row: any) => row.id)).toEqual([
      "high-gap",
      "low-gap",
      "unverified",
    ]);
    expect(body.rows[0].priceGap).toBe(10000);
    expect(body.rows[2].priceGap).toBeUndefined();
    expect(body.facets.priceGapEvidence).toBe(2);
  });
  it("keeps unsupported economics behind verified rows and orders that tail by freshness", async () => {
    const supported = {
      id: "supported",
      source: "independent_dealer",
      source_url: "https://dealer.example/vehicle/supported",
      ask_price: 10000,
      sell_estimate: 16000,
      true_net_profit: 2500,
      profit_score: 80,
      last_seen_at: "2026-10-19T00:00:00.000Z",
      price_evidence: { kind: "asking", askingPrice: 10000 },
      deal_analysis: {
        valuation: {
          resaleEvidence: true,
          source: "comparables",
          compCount: 6,
          compKind: "ask",
          confidence: "medium",
        },
      },
    };
    state.rows = [
      {
        ...supported,
        id: "unsupported-old",
        last_seen_at: "2026-10-17T00:00:00.000Z",
        price_evidence: { kind: "unknown" },
      },
      supported,
      {
        ...supported,
        id: "unsupported-new",
        last_seen_at: "2026-10-20T00:00:00.000Z",
        price_evidence: { kind: "unknown" },
      },
    ];

    const body = await (
      await request("sort=profitEstimate&sortDir=desc")
    ).json();
    expect(body.rows.map((row: { id: string }) => row.id)).toEqual([
      "supported",
      "unsupported-new",
      "unsupported-old",
    ]);
    expect(body.facets.profitEvidence).toBe(1);
    expect(body.facets.profitScoreEvidence).toBe(1);
  });
  beforeEach(() => {
    invalidate();
    state.calls = [];
    state.size = 1105;
    state.flip = true;
    state.error = null;
    state.rows = null;
    state.center = { lat: 38.63, lng: -90.2 };
  });
  it("keeps photo-less and placeholder listings researchable but out of usable-photo matches", async () => {
    state.rows = [
      {
        id: "placeholder",
        source: "independent_dealer",
        images: ["https://dealer.test/no-photo.jpg"],
      },
      {
        id: "vehicle",
        source: "independent_dealer",
        images: ["https://dealer.test/vehicle.jpg"],
      },
      { id: "no-photo", source: "independent_dealer", images: [] },
      {
        id: "unavailable",
        source: "independent_dealer",
        images: ["https://dealer.test/expired.jpg"],
        photo_state: "unavailable",
      },
    ].map((row) => ({
      ...row,
      make: "Ford",
      model: "Focus",
      year: 2020,
      ask_price: 9000,
    }));
    const all = await (await request("mode=all")).json();
    expect(all.total).toBe(4);
    expect(
      all.rows.find((row: any) => row.id === "placeholder").images,
    ).toEqual([]);
    expect(state.calls).not.toContainEqual(["not", "images", "is", null]);
    const withPhotos = await (await request("mode=all&hasPhotos=yes")).json();
    expect(withPhotos.total).toBe(1);
    expect(withPhotos.rows[0].id).toBe("vehicle");
    const without = await (await request("mode=all&hasPhotos=no")).json();
    expect(without.total).toBe(3);
    expect(without.rows.map((row: any) => row.id).sort()).toEqual([
      "no-photo",
      "placeholder",
      "unavailable",
    ]);
    expect(without.sourceCoverage.counts.independent_dealer).toBe(3);
  });
  it("uses the same price and mileage policies with legacy Market range aliases", async () => {
    const response = await request(
      "priceMax=10000&mileageMax=0&pricePolicy=include&mileagePolicy=include",
    );
    expect(response.status).toBe(200);
    expect(state.calls).toContainEqual([
      "or",
      "ask_price.is.null,ask_price.lte.0,and(ask_price.gt.0,ask_price.lte.10000)",
    ]);
    expect(state.calls).toContainEqual([
      "or",
      "mileage.is.null,mileage.lt.0,and(mileage.gte.0,mileage.lte.0)",
    ]);
    expect(state.calls).not.toContainEqual(["gt", "ask_price", 0]);
    expect(state.calls).not.toContainEqual(["lte", "mileage", 0]);
  });

  it("reaches inventory beyond PostgREST's first 1000 rows", async () => {
    const response = await request(
      "mode=all&sort=askPrice&sortDir=asc&page=21",
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.total).toBe(1105);
    expect(body.rows).toHaveLength(50);
    expect(body.rows[0].id).toBe("car-1050");
    expect(body.capped).toBe(false);
    expect(body.sourceCoverage.counts.copart).toBe(1105);
    expect(body.sourceCoverage.complete).toBe(true);
    expect(body.sourceCoverage.accessReviewIds).toContain("ae-of-miami");
    expect(state.calls).toContainEqual(["range", 1000, 1999]);
    expect(state.calls).toContainEqual(["order", "id", { ascending: true }]);
  });

  it("reuses the filtered dataset for subsequent result pages", async () => {
    await request("mode=all&sort=askPrice&sortDir=asc&page=0");
    const count = state.calls.length;
    const body = await (
      await request("mode=all&sort=askPrice&sortDir=asc&page=1")
    ).json();
    expect(body.rows[0].id).toBe("car-50");
    expect(state.calls).toHaveLength(count);
  });
  it("clamps an outdated shared page to the last real result page", async () => {
    const body = await (
      await request("mode=all&page=999&sort=askPrice&sortDir=asc")
    ).json();
    expect(body.page).toBe(22);
    expect(body.rows).toHaveLength(5);
    expect(body.rows[0].id).toBe("car-1100");
  });

  it("includes inventory beyond the former 8000-row ceiling", async () => {
    state.size = 8005;
    const body = await (await request("mode=all")).json();
    expect(body.capped).toBe(false);
    expect(body.total).toBe(8005);
    expect(state.calls).toContainEqual(["range", 8000, 8999]);
  });

  it("keeps freshness and live-auction eligibility without excluding photo-less research", async () => {
    await request("mode=all");
    expect(state.calls).not.toContainEqual(["not", "images", "is", null]);
    expect(state.calls).not.toContainEqual(["neq", "images", "{}"]);
    expect(
      state.calls.some(
        ([method, column]) => method === "gte" && column === "last_seen_at",
      ),
    ).toBe(true);
    expect(
      state.calls.some(
        ([method, filter]) =>
          method === "or" && String(filter).includes("auction_end_at.gt."),
      ),
    ).toBe(true);
  });

  it("applies categories, provider URLs, and extended filters to the database", async () => {
    const response = await request(
      "mode=all&categories=trucks&sources=govdeals&runDrive=no&maxBuyNow=20000&auctionTo=2026-10-07&listingZip=78701&hasPhotos=yes",
    );
    expect(response.status).toBe(200);
    expect(state.calls).toContainEqual(["eq", "run_drive", false]);
    expect(state.calls).toContainEqual(["lte", "buy_now_price", 20000]);
    expect(state.calls).toContainEqual([
      "lt",
      "auction_end_at",
      "2026-10-08T00:00:00.000Z",
    ]);
    expect(state.calls).toContainEqual(["eq", "location_zip", "78701"]);
    expect(
      state.calls.some(
        (call) =>
          call[0] === "or" &&
          String(call[1]).includes("body_class.ilike.%pickup%"),
      ),
    ).toBe(true);
    expect(
      state.calls.some(
        (call) => call[0] === "or" && String(call[1]).includes("govdeals.com"),
      ),
    ).toBe(true);
  });

  it.each([
    "priceMin=500&priceMax=100",
    "minMileage=bad",
    "auctionFrom=2026-02-30",
    "categories=__proto__",
    "sources=unsupported",
  ])("rejects invalid filters before querying: %s", async (search) => {
    expect((await request(search)).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("keeps personal results independent of dealer-only intelligence gates", async () => {
    state.flip = false;
    const body = await (
      await request(
        "mode=curated&minProfit=999999&minRoi=999&verdicts=pass&sort=profitEstimate",
      )
    ).json();
    expect(body.mode).toBe("all");
    expect(body.total).toBe(1105);
    expect(body.deskAccess).toBe("personal");
    expect(body.rows[0]).not.toHaveProperty("profitEstimate");
    expect(body.facets.laneProfit).toEqual({});
    expect(state.calls).not.toContainEqual(["gte", "true_net_profit", 999999]);
    expect(state.calls.some((call) => call[1] === "deal_verdict")).toBe(false);
  });

  it("withholds baseline economics and excludes them from profit filters and lane medians", async () => {
    const common = {
      source: "independent_dealer",
      make: "Ford",
      model: "F-150",
      year: 2020,
      ask_price: 12000,
      price_evidence: { kind: "asking", askingPrice: 12000 },
      source_url: "https://dealer.test/verified-car",
      last_seen_at: new Date().toISOString(),
      sell_estimate: 15000,
      true_net_profit: 2500,
      profit_score: 80,
      recommended_max_bid: 11000,
      deal_verdict: "go",
    };
    state.rows = [
      {
        ...common,
        id: "baseline",
        deal_analysis: {
          roi: 50,
          valuation: { source: "baseline", resaleEvidence: false },
        },
      },
      {
        ...common,
        id: "comparisons",
        deal_analysis: {
          roi: 20,
          valuation: {
            source: "comparables",
            resaleEvidence: true,
            compCount: 8,
            confidence: "medium",
            compKind: "ask",
          },
        },
      },
    ];
    const body = await (
      await request("mode=all&sort=profitEstimate&sortDir=desc")
    ).json();
    expect(body.total).toBe(2);
    expect(body.rows[0].id).toBe("comparisons");
    expect(body.rows[0].valuationEvidence.label).toContain(
      "8 asking-price comparisons",
    );
    for (const key of [
      "sellEstimate",
      "profitEstimate",
      "profitScore",
      "recommendedMaxBid",
      "dealVerdict",
      "roi",
    ])
      expect(body.rows[1]).not.toHaveProperty(key);
    expect(Object.values(body.facets.laneProfit)).toEqual([2500]);
    const filtered = await (await request("mode=all&minProfit=1000")).json();
    expect(filtered.rows.map((row: { id: string }) => row.id)).toEqual([
      "comparisons",
    ]);
    const curated = await (await request("mode=curated")).json();
    expect(curated.rows.map((row: { id: string }) => row.id)).toEqual([
      "comparisons",
    ]);
  });

  it.each([
    { kind: "monthly_payment", listedAmount: 299 },
    { kind: "down_payment", listedAmount: 500 },
    { kind: "finance_teaser", listedAmount: 299 },
    { kind: "reference", referenceValue: 15000 },
    { kind: "unknown", listedAmount: 1000 },
    { kind: "asking", askingPrice: 12000 },
    { kind: "buy_now", buyNow: 14000 },
  ])(
    "keeps supported resale but withholds profit and GO for an unsupported acquisition: $kind",
    async (priceEvidence) => {
      state.rows = [
        {
          id: "bad-acquisition",
          source: "independent_dealer",
          source_url: "https://dealer.test/car",
          ask_price: 1000,
          sell_estimate: 15000,
          true_net_profit: 12000,
          profit_score: 99,
          recommended_max_bid: 13000,
          deal_verdict: "go",
          last_seen_at: new Date().toISOString(),
          price_evidence: priceEvidence,
          deal_analysis: {
            roi: 1200,
            valuation: {
              source: "comparables",
              resaleEvidence: true,
              compCount: 8,
              confidence: "medium",
              compKind: "ask",
            },
          },
        },
      ];
      const body = await (await request("mode=all")).json();
      expect(body.rows[0].sellEstimate).toBe(15000);
      for (const key of [
        "profitEstimate",
        "profitScore",
        "recommendedMaxBid",
        "dealVerdict",
        "roi",
      ])
        expect(body.rows[0]).not.toHaveProperty(key);
      expect(body.facets.laneProfit).toEqual({});
      expect((await (await request("mode=curated")).json()).total).toBe(0);
      expect((await (await request("mode=all&minProfit=1")).json()).total).toBe(
        0,
      );
    },
  );

  it.each([
    {
      evidence: { kind: "current_bid", currentBid: 500 },
      missing: false,
      supported: true,
    },
    {
      evidence: {
        kind: "current_bid",
        currentBid: 500,
        checkedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      },
      missing: false,
      supported: false,
    },
    { evidence: { kind: "current_bid" }, missing: false, supported: false },
    {
      evidence: {
        kind: "current_bid",
        currentBid: 500,
        checkedAt: "2000-01-01",
      },
      missing: false,
      supported: false,
    },
    {
      evidence: { kind: "asking", askingPrice: 500 },
      missing: true,
      supported: false,
    },
  ])(
    "requires a recorded current bid and preserves missing-cost flags: %j",
    async ({ evidence, missing, supported }) => {
      state.rows = [
        {
          id: "bid",
          source: "copart",
          source_url: "https://www.copart.com/lot/123",
          ask_price: 500,
          sell_estimate: 15000,
          true_net_profit: 0,
          profit_score: 0,
          deal_verdict: "hold",
          last_seen_at: new Date().toISOString(),
          price_evidence: evidence,
          deal_analysis: {
            acquisitionPriceMissing: missing,
            roi: 0,
            valuation: {
              source: "comparables",
              resaleEvidence: true,
              compCount: 8,
              confidence: "medium",
              compKind: "ask",
            },
          },
        },
      ];
      const body = await (await request("mode=all")).json();
      expect(body.rows[0].sellEstimate).toBe(15000);
      if (supported)
        expect(body.rows[0]).toMatchObject({
          profitEstimate: 0,
          profitScore: 0,
          roi: 0,
          dealVerdict: "hold",
        });
      else expect(body.rows[0]).not.toHaveProperty("profitEstimate");
    },
  );

  it("does not exclude unpriced inventory unless a price range is requested", async () => {
    await request("mode=all&q=Ford");
    expect(state.calls).not.toContainEqual(["gt", "ask_price", 0]);
    expect(
      state.calls.some(
        (call) =>
          call[0] === "or" && String(call[1]).includes("vin.ilike.%Ford%"),
      ),
    ).toBe(true);
    await request("mode=all&priceMax=20000");
    expect(state.calls).toContainEqual(["gt", "ask_price", 0]);
  });

  it("crosses state borders, measures exact radius and excludes missing coordinates", async () => {
    state.rows = [
      {
        id: "missouri",
        source: "independent_dealer",
        source_url: "https://www.dgautollc.com/vehiclesDetail.php?1",
        lat: 38.63,
        lng: -90.2,
        location_state: "MO",
      },
      {
        id: "illinois",
        source: "independent_dealer",
        source_url: "https://www.dgautollc.com/vehiclesDetail.php?2",
        lat: 38.62,
        lng: -90.15,
        location_state: "IL",
      },
      {
        id: "outside",
        source: "copart",
        lat: 40,
        lng: -90.2,
        location_state: "IL",
      },
      { id: "unknown", source: "copart", lat: null, lng: null },
    ];
    const body = await (
      await request(
        "near=63101&radius=25&states=MO&sources=dg-auto&sort=distanceMiles&sortDir=asc",
      )
    ).json();
    expect(body.rows.map((row: any) => row.id)).toEqual([
      "missouri",
      "illinois",
    ]);
    expect(body.rows[0].distanceMiles).toBe(0);
    expect(body.location.radius).toBe(25);
    expect(state.calls).toContainEqual([
      "or",
      "and(source.eq.independent_dealer,or(source_url.ilike.%dgautollc.com%))",
    ]);
    expect(state.calls).not.toContainEqual(["in", "location_state", ["MO"]]);
    expect(
      state.calls.some((call) => call[0] === "gte" && call[1] === "lat"),
    ).toBe(true);
  });

  it("preserves photos, source, city and distinct source price evidence", async () => {
    state.rows = [
      {
        id: "bid",
        source: "copart",
        source_url: "https://www.copart.com/lot/123",
        ask_price: 1200,
        buy_now_price: 9500,
        price_evidence: { kind: "current_bid", currentBid: 1200 },
        location_city: "Dallas",
        location_state: "TX",
        images: ["https://cs.copart.com/car.jpg"],
        last_seen_at: new Date().toISOString(),
      },
    ];
    const body = await (await request("mode=all")).json();
    expect(body.rows[0]).toMatchObject({
      locationCity: "Dallas",
      imageUrl: "https://cs.copart.com/car.jpg",
      sourceUrl: "https://www.copart.com/lot/123",
      price: { kind: "current_bid", amount: 1200, buyNowPrice: 9500 },
    });
    expect(body.summary.withPhotos).toBe(1);
    expect(body.summary.askingSample).toBe(0);
    expect(body.summary.medianAsk).toBeNull();
  });

  it("returns real interactive facets, a price-mileage cell and privacy-rounded map points", async () => {
    state.rows = [
      {
        id: "facet-car",
        source: "independent_dealer",
        title: "2024 Ford Maverick",
        make: "Ford",
        model: "Maverick",
        year: 2024,
        ask_price: 14_999,
        mileage: 32_000,
        body_class: "Pickup truck",
        fuel_type: "Gasoline",
        transmission: "Automatic 8-speed",
        drivetrain: "AWD",
        color: "Blue",
        condition: "clean_title",
        seller_type: "dealer",
        assembly_country: "United States",
        availability_status: "on_lot",
        lat: 38.6274,
        lng: -90.1982,
        last_seen_at: new Date().toISOString(),
      },
    ];
    const body = await (await request("mode=all")).json();
    expect(body.rows[0]).toMatchObject({
      mapLat: 38.6,
      mapLng: -90.2,
      bodyClass: "Pickup truck",
      fuelType: "Gas",
    });
    expect(body.facets.topModels).toContainEqual({ value: "Maverick", n: 1 });
    expect(body.facets.bodyClasses).toContainEqual({ value: "Pickup", n: 1 });
    expect(body.facets.fuelTypes).toContainEqual({ value: "Gas", n: 1 });
    expect(body.facets.mapped).toBe(1);
    expect(body.facets.priceMileageMatrix).toContainEqual({
      priceFrom: 10_000,
      priceTo: 19_999,
      mileageFrom: 25_000,
      mileageTo: 49_999,
      n: 1,
    });
  });

  it("counts distinct reported powertrains without folding plug-in hybrids into gas or electric", async () => {
    state.rows = [
      {
        id: "phev",
        fuel_type: "Plug-in Hybrid Electric",
        transmission: "Automatic CVT",
        drivetrain: "Front-wheel drive",
      },
      {
        id: "hev",
        fuel_type: "Gasoline / Electric",
        transmission: "e-CVT",
        drivetrain: "All-wheel drive",
      },
      {
        id: "gas",
        fuel_type: "Gasoline",
        transmission: "Dual clutch automatic",
        drivetrain: "AWD / FWD",
      },
      {
        id: "fallback",
        fuel_type: "Unknown",
        reported_fuel: "E85 Flex Fuel",
        reported_transmission: "M/T",
        reported_drivetrain: "4x4",
      },
      {
        id: "unknown",
        fuel_type: "Hydrogen",
        reported_fuel: "Gasoline",
        transmission: "6-speed",
        reported_transmission: "Manual",
      },
    ].map((row) => ({ source: "copart", ...row }));
    const body = await (await request("mode=all")).json();
    expect(body.facets.fuelTypes).toEqual(
      expect.arrayContaining([
        { value: "PHEV", n: 1 },
        { value: "Hybrid", n: 1 },
        { value: "Gas", n: 1 },
        { value: "Flex fuel", n: 1 },
      ]),
    );
    expect(body.facets.fuelTypes).toHaveLength(4);
    expect(body.facets.transmissions).toEqual(
      expect.arrayContaining([
        { value: "CVT", n: 2 },
        { value: "DCT", n: 1 },
        { value: "Manual", n: 1 },
      ]),
    );
    expect(body.facets.transmissions).toHaveLength(3);
    expect(body.facets.drivetrains).toHaveLength(3);
    expect(body.rows.find((row: any) => row.id === "phev")).toMatchObject({
      fuelType: "PHEV",
      transmission: "CVT",
    });
  });

  it("leaves unlocated listings in results without invented map pins or mapped counts", async () => {
    const invalid = [
      [null, null],
      [undefined, undefined],
      ["", ""],
      ["  ", -90],
      [38, null],
      [null, -90],
      [false, -90],
      [38, []],
      [0, 0],
      [91, -90],
      [38, -181],
      ["unknown", -90],
    ];
    state.rows = [
      ...invalid.map(([lat, lng], i) => ({
        id: `unlocated-${i}`,
        source: "carvana",
        lat,
        lng,
      })),
      { id: "located", source: "carvana", lat: "38.6274", lng: "-90.1982" },
    ];
    const body = await (await request("mode=all")).json();
    expect(body.total).toBe(invalid.length + 1);
    expect(body.facets.mapped).toBe(1);
    expect(body.rows.find((row: any) => row.id === "located")).toMatchObject({
      mapLat: 38.6,
      mapLng: -90.2,
    });
    for (const row of body.rows.filter((row: any) => row.id !== "located")) {
      expect(row).not.toHaveProperty("mapLat");
      expect(row).not.toHaveProperty("mapLng");
    }
  });

  it("compares a cash budget to the disclosed full price, excluding deposits, payments and references", async () => {
    state.rows = [
      {
        id: "full",
        source: "independent_dealer",
        ask_price: 1000,
        listing_description: "Cash price $12,000",
        source_url: "https://dealer.test/car",
      },
      {
        id: "deposit",
        source: "independent_dealer",
        ask_price: 500,
        listing_description: "Down payment $500",
      },
      {
        id: "monthly",
        source: "independent_dealer",
        ask_price: 299,
        listing_description: "$299 per month",
      },
      {
        id: "reference",
        source: "copart",
        ask_price: 900,
        reference_only: "true",
      },
      {
        id: "bid",
        source: "copart",
        ask_price: 500,
        buy_now_price: 14000,
        price_evidence: { kind: "current_bid", currentBid: 500 },
      },
    ];
    const low = await (await request("priceBasis=cash&priceMax=1000")).json();
    expect(low.rows).toEqual([]);
    const budget = await (
      await request("priceBasis=cash&priceMax=13000")
    ).json();
    expect(budget.rows.map((row: any) => row.id)).toEqual(["full"]);
    expect(budget.rows[0].price.amount).toBe(12000);
    const bids = await (
      await request("priceBasis=advertised&priceKind=current_bid")
    ).json();
    expect(bids.rows.map((row: any) => row.id)).toEqual(["bid"]);
  });

  it.each([
    "radius=100",
    "near=unknown&radius=50",
    "near=Chicago,ZZ",
    "lat=0&lng=0&radius=50",
    "priceKind=sold",
    "priceBasis=monthly",
  ])("rejects invalid location and price choices: %s", async (search) => {
    expect((await request(search)).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("reports an unresolved location instead of silently returning nationwide inventory", async () => {
    state.center = null;
    expect((await request("near=00000&radius=50")).status).toBe(422);
    expect(state.calls).toEqual([]);
  });
});
