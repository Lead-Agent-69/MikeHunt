import { describe, it, expect } from "vitest";
import { predict } from "./predict";

describe("predict (forecasting layer)", () => {
  it("a scarce market sells fast; a flooded one sits", () => {
    expect(predict({ marketSupply: 5 }).velocity).toBe("fast");
    expect(predict({ marketSupply: 200 }).velocity).toBe("slow");
    expect(predict({ marketSupply: 40 }).velocity).toBe("normal");
    expect(predict({ marketSupply: null }).velocity).toBe("unknown");
  });

  it("price-drop chance rises with time-on-market AND being overpriced", () => {
    const fresh = predict({
      daysOnMarket: 5,
      priceVsMarket: 1.0,
    }).priceDropChance!;
    const stale = predict({
      daysOnMarket: 75,
      priceVsMarket: 1.0,
    }).priceDropChance!;
    const staleOverpriced = predict({
      daysOnMarket: 75,
      priceVsMarket: 1.3,
    }).priceDropChance!;
    expect(stale).toBeGreaterThan(fresh);
    expect(staleOverpriced).toBeGreaterThan(stale);
    // A well-priced fresh listing is unlikely to cut.
    expect(fresh).toBeLessThan(0.2);
  });

  it("a prior price cut nudges the chance up", () => {
    const a = predict({ daysOnMarket: 40, priceDrops: 0 }).priceDropChance!;
    const b = predict({ daysOnMarket: 40, priceDrops: 2 }).priceDropChance!;
    expect(b).toBeGreaterThan(a);
  });

  it("flags ACT NOW for a fresh BUY in a fast market, WATCH when it's slow", () => {
    expect(
      predict({ isBuy: true, marketSupply: 4, daysOnMarket: 2 }).urgency,
    ).toBe("act_now");
    expect(
      predict({ isBuy: true, marketSupply: 300, daysOnMarket: 90 }).urgency,
    ).toBe("watch");
    // Not a BUY → no urgency.
    expect(predict({ isBuy: false, marketSupply: 4 }).urgency).toBe("none");
  });

  it("projects ROI from net profit and cost", () => {
    expect(predict({ netProfit: 5000, cost: 20000 }).projectedRoiPct).toBe(25);
    expect(predict({ netProfit: 5000, cost: 0 }).projectedRoiPct).toBeNull();
  });

  it("always returns explainable reasons", () => {
    const p = predict({
      isBuy: true,
      marketSupply: 4,
      daysOnMarket: 2,
      netProfit: 4000,
      cost: 16000,
    });
    expect(p.reasons.length).toBeGreaterThan(0);
    expect(p.reasons.join(" ")).toMatch(/Act now|fast|ROI/i);
  });
});
