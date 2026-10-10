import { describe, expect, it } from "vitest";
import { calculateProfit } from "./profit-calculator";

describe("explicit acquisition scenario costs", () => {
  it("keeps high-scoring lower-margin opportunities on HOLD without discarding their math", () => {
    const base = {
      askPrice: 1000,
      salePrice: 3999,
      repairCost: 0,
      holdingDays: 0,
      transportCost: 0,
    };
    const result = calculateProfit(base);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.profit).toBe(2999);
    expect(result.verdict).toBe("hold");
    expect(result.warnings.join(" ")).toContain("$3,000 GO threshold");
    expect(calculateProfit({ ...base, salePrice: 4000 }).verdict).toBe("go");
    expect(
      calculateProfit({ ...base, salePrice: 4000, targetProfit: 5000 }).verdict,
    ).toBe("hold");
    expect(
      calculateProfit({ ...base, salePrice: 6000, targetProfit: 5000 }).verdict,
    ).toBe("go");
  });
  it("preserves a confirmed zero instead of substituting repair, transport or holding defaults", () => {
    const result = calculateProfit({
      askPrice: 10000,
      salePrice: 12000,
      damageType: "FRONT END",
      repairCost: 0,
      transportCost: 0,
      miles: 1000,
      holdingDays: 0,
      dailyFloorRate: 0,
      marketDemandScore: 0,
      marketVelocityScore: 0,
      seasonalityScore: 0,
      competitionScore: 0,
    });
    expect(result.totalCost).toBe(10000);
    expect(result.profit).toBe(2000);
    expect(result.roi).toBe(20);
    expect(result.scoreBreakdown.marketDemandScore).toBe(0);
    expect(result.scoreBreakdown.marketVelocityScore).toBe(0);
  });

  it("keeps legacy estimates only when an input is absent", () => {
    const result = calculateProfit({
      askPrice: 10000,
      salePrice: 12000,
      damageType: "FRONT END",
    });
    expect(result.repairCost).toBe(2500);
    expect(result.holdingCost).toBe(490);
    expect(result.profit).toBeLessThan(0);
  });

  it("calculates net profit after selling costs, distinct from maximum-buy headroom", () => {
    const result = calculateProfit({
      askPrice: 12000,
      salePrice: 19000,
      sellingFee: 1000,
      auctionFee: 900,
      transportCost: 600,
      repairCost: 2000,
      titleFee: 500,
      holdingDays: 10,
      dailyFloorRate: 40,
    });
    expect(result.profit).toBe(1600);
    expect(result.totalCost).toBe(17400);
    expect(result.roi).toBeCloseTo((1600 / 17400) * 100);
  });
});
