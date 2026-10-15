import { describe, expect, it } from "vitest";
import {
  hasRadiusCollectionScope,
  nearbySearchDraft,
} from "./nearby-search-draft";

describe("nearby search scope", () => {
  it("recognizes unsupported collection location fields without rejecting state-only searches", () => {
    expect(hasRadiusCollectionScope({ zip: "63101", radius: 50 })).toBe(true);
    expect(hasRadiusCollectionScope({ radiusMiles: 100 })).toBe(true);
    expect(
      hasRadiusCollectionScope({ state: "MO", states: ["MO", "IL"] }),
    ).toBe(false);
    expect(hasRadiusCollectionScope(null)).toBe(false);
  });
  it("removes a state boundary once the user enters a complete ZIP", () => {
    expect(nearbySearchDraft("63101")).toEqual({
      zip: "63101",
      clearStateBoundary: true,
    });
  });
  it("keeps partial input from changing the selected market and preserves leading zeroes", () => {
    expect(nearbySearchDraft("6310").clearStateBoundary).toBe(false);
    expect(nearbySearchDraft("02108").zip).toBe("02108");
    expect(nearbySearchDraft("63a10")).toEqual({
      zip: "6310",
      clearStateBoundary: false,
    });
  });
});
