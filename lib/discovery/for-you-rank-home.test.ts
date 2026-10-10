import { describe, expect, it } from "vitest";
import { transportCostForMiles } from "@/lib/geo";
import {
  buyerDistanceFields,
  compareFlip,
  rowBuyerDistance,
  scopeMatchScore,
  transportAdjustedProfit,
} from "./for-you-rank";

// St. Louis MO buyer pin, Kansas City MO listing (~240 straight-line mi).
const HOME = { state: "MO", lat: 38.627, lng: -90.199 };
const KC = { locationState: "MO", lat: 39.0997, lng: -94.5786 };

describe("buyer home GeoPoint wiring", () => {
  it("measures real coords when both sides have them", () => {
    const d = rowBuyerDistance(KC, HOME);
    expect(d.basis).toBe("coords");
    expect(d.miles).toBeGreaterThan(280);
    expect(d.miles).toBeLessThan(340);
  });

  it("falls back to state centroids across states without coords", () => {
    const d = rowBuyerDistance(
      { locationState: "TX" },
      { state: "MO", zip: "63101" },
    );
    expect(d.basis).toBe("state_centroid");
    expect(d.miles).toBeGreaterThan(0);
  });

  it("same state without listing coords is unmeasured, not 45 mi", () => {
    const d = rowBuyerDistance({ locationState: "MO" }, HOME);
    expect(d).toMatchObject({ basis: "same_state", miles: null });
  });

  it("guest / no home → unknown basis, never a TX or CA default", () => {
    for (const home of [null, undefined, "", "NATIONWIDE"]) {
      const d = rowBuyerDistance({ locationState: "TX" }, home as any);
      expect(d.basis).toBe("unknown");
      expect(d.miles).toBeNull();
      expect(d.homeState).toBeNull();
      expect(buyerDistanceFields({ locationState: "CA" }, home as any)).toEqual(
        {
          distanceBasis: "unknown",
        },
      );
    }
  });

  it("buyerDistanceFields exposes miles only when measured", () => {
    expect(buyerDistanceFields(KC, HOME)).toMatchObject({
      distanceBasis: "coords",
      distanceMiles: expect.any(Number),
    });
    expect(buyerDistanceFields({ locationState: "MO" }, HOME)).toEqual({
      distanceBasis: "same_state",
    });
  });

  it("transportAdjustedProfit uses the coords distance when home is a GeoPoint", () => {
    const row = { ...KC, trueNetProfit: 5000, transportEstimate: 900 };
    const miles = rowBuyerDistance(KC, HOME).miles!;
    expect(transportAdjustedProfit(row, HOME)).toBe(
      5000 + 900 - transportCostForMiles(miles),
    );
    // No home keeps the stored profit untouched.
    expect(transportAdjustedProfit(row, null)).toBe(5000);
  });

  it("string homes still work (legacy callers)", () => {
    const row = {
      locationState: "TX",
      trueNetProfit: 5000,
      transportEstimate: 900,
    };
    expect(transportAdjustedProfit(row, "TX")).toBe(
      transportAdjustedProfit(row, { state: "TX" }),
    );
  });

  it("compareFlip ranks the closer listing first with a GeoPoint home", () => {
    const near = { ...KC, trueNetProfit: 3000, transportEstimate: 1500 };
    const far = {
      locationState: "CA",
      trueNetProfit: 3000,
      transportEstimate: 1500,
    };
    // Sort comparator: negative = first argument ranks first.
    expect(compareFlip(near, far, HOME)).toBeLessThan(0);
    expect([far, near].sort((a, b) => compareFlip(a, b, HOME))[0]).toBe(near);
  });

  it("scopeMatchScore reads the home state from a GeoPoint (ZIP only too)", () => {
    const row = { locationState: "MO" };
    expect(scopeMatchScore(row, {}, [], { zip: "63101" })).toBe(1);
    expect(scopeMatchScore(row, {}, [], null)).toBe(0);
  });
});
