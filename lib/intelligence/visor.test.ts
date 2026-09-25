import { describe, it, expect } from "vitest";
import { daysOnMarket, domTier } from "./days-on-market";
import { fitDepreciationCurve } from "../scoring/depreciation";
import { crossRunBackoffMultiplier } from "../scrapers/tools/circuit-breaker";

describe("daysOnMarket", () => {
  it("computes whole days since first seen", () => {
    const d = new Date(Date.now() - 10 * 86400000).toISOString();
    expect(daysOnMarket(d)).toBe(10);
  });
  it("returns null for missing input and clamps negatives to 0", () => {
    expect(daysOnMarket(null)).toBeNull();
    expect(daysOnMarket(new Date(Date.now() + 86400000))).toBe(0);
  });
  it("tiers fresh/aging/stale", () => {
    expect(domTier(5).label).toBe("fresh");
    expect(domTier(30).label).toBe("aging");
    expect(domTier(60).label).toContain("motivated");
  });
});

describe("fitDepreciationCurve", () => {
  it("recovers a known downward slope", () => {
    // price = 30000 - 0.1 * miles
    const points = Array.from({ length: 20 }, (_, i) => ({
      mileage: i * 5000,
      price: 30000 - 0.1 * i * 5000,
    }));
    const fit = fitDepreciationCurve(points)!;
    expect(fit).not.toBeNull();
    expect(fit.depreciationPer1000Miles).toBe(100); // |slope|*1000 = 0.1*1000
    expect(fit.predictPriceAtMileage(50000)).toBeCloseTo(25000, -2);
  });
  it("returns null on too-few points", () => {
    expect(fitDepreciationCurve([{ mileage: 1000, price: 5000 }])).toBeNull();
  });
});

describe("crossRunBackoffMultiplier", () => {
  it("is 1× with no failures and grows exponentially, capped at 24×", () => {
    expect(crossRunBackoffMultiplier(0)).toBe(1);
    expect(crossRunBackoffMultiplier(1)).toBe(2);
    expect(crossRunBackoffMultiplier(3)).toBe(8);
    expect(crossRunBackoffMultiplier(10)).toBe(24); // capped
  });
});
