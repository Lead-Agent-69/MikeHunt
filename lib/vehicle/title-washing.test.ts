import { describe, it, expect } from "vitest";
import { sightingsToHistory } from "./vin-history";

describe("sightingsToHistory — title-washing & cross-state catches", () => {
  it("flags branded-then-clean as possible title washing", () => {
    const h = sightingsToHistory([
      { source: "copart", condition: "salvage_title", created_at: "2026-01-01T00:00:00Z", location_state: "TX" },
      { source: "cars_com", condition: "clean", created_at: "2026-05-01T00:00:00Z", location_state: "OK" },
    ]);
    expect(h?.titleBrands.some((f) => /title washing/i.test(f))).toBe(true);
    expect(h?.titleBrands.some((f) => /moved across states/i.test(f))).toBe(true);
  });

  it("does NOT flag washing when the car was always clean", () => {
    const h = sightingsToHistory([
      { source: "cars_com", condition: "clean", created_at: "2026-01-01T00:00:00Z" },
      { source: "carvana", condition: "clean", created_at: "2026-05-01T00:00:00Z" },
    ]);
    expect(h).toBeNull();
  });

  it("does NOT flag washing for clean-then-branded (order matters)", () => {
    const h = sightingsToHistory([
      { source: "cars_com", condition: "clean", created_at: "2026-01-01T00:00:00Z" },
      { source: "copart", condition: "salvage_title", created_at: "2026-05-01T00:00:00Z" },
    ]);
    // Still a prior-brand flag, but NOT washing (it didn't get re-laundered to clean).
    expect(h?.titleBrands.some((f) => /title washing/i.test(f))).toBe(false);
    expect(h?.titleBrands.some((f) => /salvage|Copart/i.test(f))).toBe(true);
  });
});
