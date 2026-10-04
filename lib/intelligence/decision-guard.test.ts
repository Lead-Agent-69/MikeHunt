import { describe, expect, it } from "vitest";
import { assessDecisionEvidence } from "./decision-guard";

describe("assessDecisionEvidence", () => {
  it("holds a cheap Copart bid for auction verification instead of promoting it as a buy", () => {
    const result = assessDecisionEvidence({
      source: "copart",
      condition: "salvage",
      vin: "5J8YD4H5XL0000001",
      mileage: 42000,
      dealVerdict: "go",
      valuation: { source: "comparables", compCount: 12, confidence: "high" },
    });
    expect(result.state).toBe("auction_watch");
    expect(result.acquisitionReady).toBe(false);
  });

  it("does not let an implausible price reach purchase-ready status", () => {
    const result = assessDecisionEvidence({
      source: "dealer",
      vin: "1HGCM82633A000000",
      mileage: 40000,
      dealVerdict: "go",
      dealAnalysis: { priceImplausible: true },
    });
    expect(result.state).toBe("price_anomaly");
  });

  it("requires identity and comparable evidence for a purchase recommendation", () => {
    const result = assessDecisionEvidence({
      source: "dealer",
      vin: "1HGCM82633A000000",
      mileage: 40000,
      dealVerdict: "go",
      valuation: { source: "comparables", compCount: 8, confidence: "high" },
    });
    expect(result.state).toBe("verified");
    expect(result.acquisitionReady).toBe(true);
  });
});
