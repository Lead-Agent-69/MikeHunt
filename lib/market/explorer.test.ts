import { describe, expect, it } from "vitest";
import {
  canonicalMarketMake,
  marketDistance,
  parseMarketLocation,
  summarizeMarket,
  type MarketListing,
} from "./explorer";

import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { surroundingStates } from "@/lib/geo/bordering-states";

describe("canonicalMarketMake", () => {
  it("merges common source spellings into one make facet", () => {
    expect(canonicalMarketMake("Gm")).toBe("GMC");
    expect(canonicalMarketMake("gmc")).toBe("GMC");
    expect(canonicalMarketMake("chevy")).toBe("Chevrolet");
    expect(canonicalMarketMake("mercedes benz")).toBe("Mercedes-Benz");
  });
});

const now = Date.parse("2026-10-16T12:00:00Z");
function listing(amount: number, kind: string, age = 0): MarketListing {
  return {
    id: `${amount}`,
    title: "Car",
    source: "independent_dealer",
    make: "Ford",
    model: "Focus",
    year: 2020,
    askPrice: amount,
    profitEstimate: 0,
    profitScore: 0,
    images: ["https://dealer.test/car.jpg"],
    lane: "private",
    lastSeenAt: new Date(now - age * 86400000).toISOString(),
    price: sourcePriceContext(
      {
        source: "independent_dealer",
        source_url: "https://dealer.test/car",
        ask_price: amount,
        last_seen_at: new Date(now - age * 86400000).toISOString(),
        price_evidence: { kind, askingPrice: amount },
        condition: "clean_title",
        mileage: 50000,
      },
      now,
    ),
  };
}

describe("market evidence", () => {
  it("uses the median of comparable cash asks and excludes stale prices and other amount types", () => {
    const summary = summarizeMarket(
      [
        listing(10000, "asking"),
        listing(20000, "asking"),
        listing(300, "monthly_payment"),
        listing(30000, "reference"),
        listing(1000, "current_bid"),
        listing(50000, "asking", 31),
      ],
      now,
    );
    expect(summary.medianAsk).toBe(15000);
    expect(summary.askingSample).toBe(2);
    expect(summary.count).toBe(6);
    expect(summary.withPhotos).toBe(6);
    expect(summary.fresh24h).toBe(5);
  });
  it("keeps missing and zero coordinates out of radius matching", () => {
    expect(
      marketDistance({ lat: 38, lng: -90 }, { lat: null, lng: null }),
    ).toBeNull();
    expect(
      marketDistance({ lat: 38, lng: -90 }, { lat: 0, lng: 0 }),
    ).toBeNull();
  });
  it("accepts city, ZIP and browser coordinates without substituting a state centroid", () => {
    expect(
      parseMarketLocation(
        new URLSearchParams("near=St.+Louis%2C+MO&radius=150"),
      ),
    ).toMatchObject({
      place: { city: "St. Louis", state: "MO" },
      radius: 150,
      center: null,
    });
    expect(
      parseMarketLocation(new URLSearchParams("near=63101")),
    ).toMatchObject({ place: { zip: "63101" }, radius: 100 });
    expect(
      parseMarketLocation(new URLSearchParams("lat=38&lng=-90&radius=25")),
    ).toMatchObject({ center: { lat: 38, lng: -90 }, radius: 25 });
  });
  it("includes every state bordering Missouri, rather than only the nearest centroids", () => {
    expect(surroundingStates("MO")).toEqual([
      "MO",
      "AR",
      "IA",
      "IL",
      "KS",
      "KY",
      "NE",
      "OK",
      "TN",
    ]);
    expect(surroundingStates("TX")).toEqual(["TX", "AR", "LA", "NM", "OK"]);
    expect(surroundingStates("AK")).toEqual(["AK"]);
  });
});
