import { describe, expect, it } from "vitest";
import {
  discoverMatchLabel,
  marketListingsContext,
  todaySourceProofLabel,
} from "./count-labels";

describe("inventory count labels (MO 245 / 246 / 290)", () => {
  it("Discover says vehicles for the VIN-merged count and shows the listing count", () => {
    expect(
      discoverMatchLabel({ uniqueVehicles: 245, totalListings: 246 }),
    ).toBe(
      "245 matching vehicles · 246 listings (1 duplicate across sites merged)",
    );
    expect(discoverMatchLabel({ uniqueVehicles: 10, totalListings: 10 })).toBe(
      "10 matching vehicles",
    );
    expect(
      discoverMatchLabel({
        uniqueVehicles: 3,
        totalListings: 3,
        previewMode: true,
      }),
    ).toBe("3 vehicles in preview");
  });

  it("explains the wider market count as before-filters", () => {
    expect(
      marketListingsContext({
        marketListings: 290,
        totalListings: 246,
        placeName: "Missouri",
      }),
    ).toBe(
      "290 active listings in Missouri under your price ceiling, before your other filters narrow it to 246 listings.",
    );
    expect(
      marketListingsContext({
        marketListings: 246,
        totalListings: 246,
        placeName: "Missouri",
      }),
    ).toBeNull();
  });

  it("Today counts listings, matching Scan's active total", () => {
    const label = todaySourceProofLabel({
      readySources: 1,
      rows: 246,
      photos: 240,
      quality: 71,
    });
    expect(label).toContain("246 matching listings");
    expect(label).not.toMatch(/\brows?\b/);
  });
});
