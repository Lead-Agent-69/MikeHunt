import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("nearby distance honesty", () => {
  it("NearbyDeals never stands on Distance not available without miles", () => {
    const src = read("components/discovery/NearbyDeals.tsx");
    expect(src).not.toContain("Distance not available");
    expect(src).toContain("About ${Math.round(miles)} miles");
    expect(src).toContain("City and state from each listing");
  });

  it("MarketPicker does not promise instant near-you results", () => {
    const src = read("components/shared/MarketPicker.tsx");
    expect(src).not.toMatch(/near you instantly/i);
    expect(src).toContain("from saved inventory");
  });

  it("Onboarding aligns refresh language with Scan CTAs", () => {
    const src = read("app/onboarding/page.tsx");
    expect(src).toContain("Search saved inventory");
    expect(src).toContain("Find new matches");
    expect(src).not.toMatch(/Choose Refresh\s+inventory/i);
  });
});
