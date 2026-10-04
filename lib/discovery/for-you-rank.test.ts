import { describe, expect, it } from "vitest";
import { milesBetweenStates, transportCostForMiles } from "@/lib/geo";
import {
  comparePersonal,
  dropsForNoRepair,
  rowMatchesBuyerQuery,
  scopeMatchScore,
  transportAdjustedProfit,
} from "./for-you-rank";

describe("buyer scope match", () => {
  it("matches SUVs by segment, not the word suvs in the title", () => {
    const tahoe = {
      make: "Chevrolet",
      model: "Tahoe",
      title: "2018 Chevrolet Tahoe LT",
    };
    const civic = {
      make: "Honda",
      model: "Civic",
      title: "SUVS AND MORE Civic",
    };
    expect(rowMatchesBuyerQuery(tahoe, "suvs")).toBe(true);
    expect(rowMatchesBuyerQuery(civic, "suvs")).toBe(false);
    expect(
      rowMatchesBuyerQuery(
        { make: "Toyota", model: "Camry", title: "Camry LE" },
        "camry",
      ),
    ).toBe(true);
  });

  it("scores vehicle and title from buyerScope, and drops salvage when repair is none", () => {
    const suv = {
      make: "Toyota",
      model: "Highlander",
      segment: "suv",
      titleClass: "clean",
      lane: "private",
      condition: "clean",
    };
    const wreck = {
      ...suv,
      lane: "salvage",
      titleClass: "salvage",
      condition: "salvage",
    };
    const scope = { vehicleType: "suvs", titleType: "clean" };
    expect(scopeMatchScore(suv, scope)).toBeGreaterThan(
      scopeMatchScore(wreck, scope),
    );
    expect(dropsForNoRepair(wreck, "none")).toBe(true);
    expect(dropsForNoRepair(suv, "none")).toBe(false);
    expect(dropsForNoRepair(wreck, "advanced")).toBe(false);
  });

  it("sorts personal buyers by scope then recency, not profit", () => {
    const olderMatch = {
      make: "Ford",
      model: "Explorer",
      segment: "suv",
      lastSeenAt: "2026-10-01T00:00:00.000Z",
      profitScore: 99,
      trueNetProfit: 9000,
    };
    const newerOther = {
      make: "Honda",
      model: "Civic",
      segment: "sedan",
      lastSeenAt: "2026-10-04T00:00:00.000Z",
      profitScore: 10,
      trueNetProfit: 100,
    };
    const newerMatch = {
      ...olderMatch,
      lastSeenAt: "2026-10-03T00:00:00.000Z",
      profitScore: 1,
    };
    const scope = {
      vehicleType: "suvs",
      buyerMode: "personal",
      timeline: "month",
    };
    const rows = [newerOther, olderMatch, newerMatch].sort((a, b) =>
      comparePersonal(a, b, scope),
    );
    expect(rows.map((r) => r.lastSeenAt)).toEqual([
      newerMatch.lastSeenAt,
      olderMatch.lastSeenAt,
      newerOther.lastSeenAt,
    ]);
  });

  it("prefers a stored auction end when the timeline is now", () => {
    const soon = {
      make: "Ford",
      model: "Explorer",
      segment: "suv",
      lastSeenAt: "2026-09-01T00:00:00.000Z",
      auctionEndAt: "2026-10-05T12:00:00.000Z",
    };
    const later = {
      ...soon,
      lastSeenAt: "2026-10-04T00:00:00.000Z",
      auctionEndAt: "2026-10-20T12:00:00.000Z",
    };
    const scope = { vehicleType: "suvs", timeline: "now" as const };
    expect(
      comparePersonal(
        soon,
        later,
        scope,
        [],
        null,
        Date.parse("2026-10-04T00:00:00.000Z"),
      ),
    ).toBeLessThan(0);
  });
});

describe("transport re-rank", () => {
  it("swaps stored transport for the buyer home state and leaves the dollar alone", () => {
    const deal = {
      trueNetProfit: 5000,
      transportEstimate: 2000,
      locationState: "CA",
    };
    const miles = milesBetweenStates("CA", "CA");
    expect(miles).toBe(45);
    const adjusted = transportAdjustedProfit(deal, "CA");
    expect(adjusted).toBe(5000 + 2000 - transportCostForMiles(miles!));
    expect(deal.trueNetProfit).toBe(5000);
    expect(transportAdjustedProfit(deal, "")).toBe(5000);
    expect(transportAdjustedProfit({ ...deal, locationState: "" }, "TX")).toBe(
      5000,
    );
  });
});
