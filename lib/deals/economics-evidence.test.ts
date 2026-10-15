import { describe, expect, it } from "vitest";
import { economicsEvidenceReady } from "./economics-evidence";

const evidence = () => ({
  valuation: {
    source: "comparables",
    confidence: "high",
    soldLane: "clean",
    soldAnchored: true,
    soldCount: 3,
    soldAt: new Date(Date.now() - 86400000).toISOString(),
  },
  evidenceGates: {
    priceMeaningConfirmed: true,
    titleReviewed: true,
    conditionInspected: true,
    costsConfirmed: true,
  },
});

describe("auction economics evidence", () => {
  it("requires sold evidence and every purchase-cost gate", () => {
    expect(economicsEvidenceReady(evidence())).toBe(true);
    for (const key of Object.keys(evidence().evidenceGates)) {
      const input = evidence();
      (input.evidenceGates as Record<string, boolean>)[key] = false;
      expect(economicsEvidenceReady(input)).toBe(false);
    }
  });
  it("rejects missing, undated, stale and future sold observations", () => {
    expect(economicsEvidenceReady(null)).toBe(false);
    expect(
      economicsEvidenceReady({ valuation: { source: "comparables" } }),
    ).toBe(false);
    for (const soldAt of [
      "",
      new Date(Date.now() - 181 * 86400000).toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    ]) {
      const input = evidence();
      input.valuation.soldAt = soldAt;
      expect(economicsEvidenceReady(input)).toBe(false);
    }
  });
});
