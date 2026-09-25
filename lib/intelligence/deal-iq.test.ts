import { describe, it, expect } from "vitest";
import { computeDealIQ } from "./deal-iq";
import { extractWinPatterns, matchWin } from "./win-patterns";
import { mispricingOf, isUnderpriced } from "./mispricing";

describe("computeDealIQ", () => {
  it("scores a deep-discount, high-demand, win-matched deal as elite", () => {
    const iq = computeDealIQ({
      askPrice: 12000,
      sellEstimate: 20000,
      compsConfidence: "high",
      trueNetProfit: 5000,
      demand: "high",
      timing: "BUY_NOW",
      winMatch: { matched: true, avgProfit: 4200, count: 4 },
      mispricing: { pctBelowCluster: 22, z: -1.2 },
    });
    expect(iq.tier).toBe("elite");
    expect(iq.score).toBeGreaterThanOrEqual(80);
    expect(iq.signals.find((s) => s.key === "win")?.detail).toContain("4");
  });

  it("scores an overpriced, soft, no-profit deal as weak", () => {
    const iq = computeDealIQ({
      askPrice: 22000,
      sellEstimate: 20000,
      compsConfidence: "high",
      trueNetProfit: -500,
      demand: "soft",
      timing: "WAIT",
    });
    expect(iq.tier).toBe("weak");
    expect(iq.score).toBeLessThan(50);
  });

  it("degrades gracefully with only one signal", () => {
    const iq = computeDealIQ({
      askPrice: 10000,
      sellEstimate: 13000,
      compsConfidence: "medium",
    });
    expect(iq.signals.length).toBe(1);
    expect(iq.score).toBeGreaterThan(0);
  });

  it("discounts profit when the dealer calibration shows over-prediction", () => {
    const base = computeDealIQ({
      askPrice: 10000,
      sellEstimate: 15000,
      compsConfidence: "high",
      trueNetProfit: 4000,
    });
    const calibrated = computeDealIQ({
      askPrice: 10000,
      sellEstimate: 15000,
      compsConfidence: "high",
      trueNetProfit: 4000,
      calibrationProfitBiasPct: -30,
    });
    const baseProfit = base.signals.find((s) => s.key === "profit")!.score;
    const calProfit = calibrated.signals.find((s) => s.key === "profit")!.score;
    expect(calProfit).toBeLessThan(baseProfit);
  });
});

describe("win-patterns", () => {
  const outcomes = [
    { make: "Ford", model: "F-150", actual_profit: 4000 },
    { make: "Ford", model: "F-150", actual_profit: 4400 },
    { make: "Honda", model: "Civic", actual_profit: 1500 },
    { make: "Ford", model: "F-150", actual_profit: -200 }, // loss, excluded
  ];
  it("aggregates profitable outcomes into ranked patterns", () => {
    const p = extractWinPatterns(outcomes);
    expect(p[0].make).toBe("Ford");
    expect(p[0].count).toBe(2);
    expect(p[0].avgProfit).toBe(4200);
  });
  it("matches a vehicle to a win pattern (model-normalized)", () => {
    const p = extractWinPatterns(outcomes);
    expect(matchWin("Ford", "F150", p).matched).toBe(true);
    expect(matchWin("Toyota", "Tacoma", p).matched).toBe(false);
  });
});

describe("mispricing", () => {
  it("flags a clear underpriced outlier", () => {
    const peers = [20000, 21000, 19500, 20500, 22000, 19800];
    const m = mispricingOf(15000, peers);
    expect(m).not.toBeNull();
    expect(m!.pctBelowCluster).toBeGreaterThan(15);
    expect(m!.z).toBeLessThan(0);
    expect(isUnderpriced(m)).toBe(true);
  });
  it("returns null for a too-thin cluster", () => {
    expect(mispricingOf(15000, [20000, 21000])).toBeNull();
  });
  it("does not flag a fairly-priced deal", () => {
    const peers = [20000, 21000, 19500, 20500, 22000, 19800];
    expect(isUnderpriced(mispricingOf(20200, peers))).toBe(false);
  });
});
