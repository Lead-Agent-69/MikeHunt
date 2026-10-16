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
const request = (search: string) =>
  GET(new NextRequest(`https://example.test/api/market/explore?${search}`));

describe("Market inventory filtering and pagination", () => {
  beforeEach(() => {
    invalidate();
    state.calls = [];
    state.size = 1105;
    state.flip = true;
    state.error = null;
    state.rows = null;
    state.center = { lat: 38.63, lng: -90.2 };
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

  it("keeps photo, freshness and live-auction eligibility before pagination", async () => {
    await request("mode=all");
    expect(state.calls).toContainEqual(["not", "images", "is", null]);
    expect(state.calls).toContainEqual(["neq", "images", "{}"]);
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
        source: "copart",
        lat: 38.63,
        lng: -90.2,
        location_state: "MO",
      },
      {
        id: "illinois",
        source: "copart",
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
        "near=63101&radius=25&states=MO&sort=distanceMiles&sortDir=asc",
      )
    ).json();
    expect(body.rows.map((row: any) => row.id)).toEqual([
      "missouri",
      "illinois",
    ]);
    expect(body.rows[0].distanceMiles).toBe(0);
    expect(body.location.radius).toBe(25);
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
      fuelType: "Gasoline",
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
