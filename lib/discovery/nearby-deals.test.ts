import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("NearbyDeals state scope", () => {
  const src = readFileSync("components/discovery/NearbyDeals.tsx", "utf8");

  it("asks for one state and does not add neighbor states", () => {
    expect(src).not.toContain("nearbyStates");
    expect(src).not.toContain("neighbor");
    expect(src).toContain("`/api/scan?states=${center}&sort=${sort}`");
    // Profit ranking only for a saved reseller/dealer desk; everyone else asks for trust ranking.
    expect(src).toMatch(
      /isFlipBuyerMode\(prefs\?\.buyerScope\?\.buyerMode\)\s*\?\s*"profit"\s*:\s*"score"/,
    );
    expect(src).not.toContain("radius=150");
    expect(src).not.toContain("/api/deals/near");
  });
});
