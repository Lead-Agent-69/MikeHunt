import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("NearbyDeals search scope", () => {
  const src = readFileSync("components/discovery/NearbyDeals.tsx", "utf8");

  it("uses ZIP/radius across borders, with a state-only fallback when no ZIP is set", () => {
    expect(src).not.toContain("nearbyStates");
    expect(src).not.toContain("neighbor");
    expect(src).toContain("`/api/scan?states=${center}&sort=${sort}`");
    expect(src).toContain(
      "`/api/scan?zip=${zip}&radius=${radius}&sort=${sort}`",
    );
    expect(src).toContain('aria-label="Distance from ZIP"');
    expect(src).toContain('aria-label="Search ZIP code"');
    expect(src).toContain("`Within ${radius} mi of ${zip}`");
    expect(src).not.toContain("within driving distance");
    expect(src).not.toContain("keepPreviousData: true");
    // Profit ranking only for a saved reseller/dealer desk; everyone else asks for trust ranking.
    expect(src).toMatch(
      /isFlipBuyerMode\(prefs\?\.buyerScope\?\.buyerMode\)\s*\?\s*"profit"\s*:\s*"score"/,
    );
    expect(src).not.toContain("radius=150");
    expect(src).not.toContain("/api/deals/near");
  });
});
