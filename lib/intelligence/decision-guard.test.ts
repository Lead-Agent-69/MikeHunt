import { describe, expect, it } from "vitest";
import { assessDecisionEvidence } from "./decision-guard";

describe("assessDecisionEvidence", () => {
  it("keeps auction buy-now evidence distinct from a current bid", () => {
    const result = assessDecisionEvidence({
      source: "copart",
      buyNowPrice: 12000,
    });
    expect(result.summary).toMatch(/buy-now price/);
    expect(result.summary).not.toMatch(/current auction price/);
    expect(result.acquisitionReady).toBe(false);
  });
  it("holds stored government auction rows even with a stale buy verdict", () => {
    expect(
      assessDecisionEvidence({
        source: "gov_auction",
        dealVerdict: "go",
        vin: "1HGCM82633A000000",
        mileage: 40000,
        valuation: { source: "comparables", compCount: 8 },
      }).acquisitionReady,
    ).toBe(false);
  });
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

  it("does not interpret a stored GO and asking comparisons as completed purchase checks", () => {
    const result = assessDecisionEvidence({
      source: "dealer",
      vin: "1HGCM82633A000000",
      mileage: 40000,
      dealVerdict: "go",
      valuation: { source: "comparables", compCount: 8, confidence: "high" },
    });
    expect(result.acquisitionReady).toBe(false);
    expect(result.nextCheck).toMatch(
      /asking prices are not confirmed sale prices/,
    );
  });

  it("requires explicit evidence gates and recent clean completed sales for a purchase candidate", () => {
    const result = assessDecisionEvidence({
      source: "dealer",
      vin: "1HGCM82633A000000",
      mileage: 40000,
      dealVerdict: "go",
      valuation: {
        source: "comparables",
        compCount: 8,
        confidence: "high",
        soldCount: 3,
        soldAnchored: true,
        soldLane: "clean",
        soldAt: new Date(Date.now() - 86400000).toISOString(),
      },
      dealAnalysis: {
        evidenceGates: {
          priceMeaningConfirmed: true,
          titleReviewed: true,
          conditionInspected: true,
          costsConfirmed: true,
        },
      },
    });
    expect(result.state).toBe("verified");
    expect(result.acquisitionReady).toBe(true);
  });

  it.each([undefined, "none", "low"])(
    "withholds third-party valuation with %s confidence",
    (confidence) => {
      expect(
        assessDecisionEvidence({
          source: "dealer",
          vin: "1HGCM82633A000000",
          mileage: 40000,
          dealVerdict: "go",
          valuation: { source: "third_party", confidence },
        }).acquisitionReady,
      ).toBe(false);
    },
  );

  it("does not accept malformed identity or string-valued gate claims", () => {
    expect(
      assessDecisionEvidence({
        source: "dealer",
        vin: "unknown",
        mileage: 40000,
        dealVerdict: "go",
        valuation: { source: "comparables", compCount: 8, confidence: "high" },
        dealAnalysis: { evidenceGates: { costsConfirmed: "true" } },
      }).acquisitionReady,
    ).toBe(false);
  });
  it("does not promote asking comps or unproven third-party labels despite completed checkboxes", () => {
    for (const valuation of [
      { source: "comparables", compCount: 8, confidence: "high" },
      { source: "third_party", confidence: "high" },
      ...[
        undefined,
        "invalid",
        new Date(Date.now() - 181 * 86400000).toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ].map((soldAt) => ({
        source: "comparables",
        compCount: 8,
        confidence: "high",
        soldCount: 3,
        soldAnchored: true,
        soldLane: "clean",
        soldAt,
      })),
      {
        source: "comparables",
        compCount: 8,
        confidence: "high",
        soldCount: 3,
        soldAnchored: true,
        soldLane: "salvage",
        soldAt: new Date().toISOString(),
      },
    ]) {
      expect(
        assessDecisionEvidence({
          source: "dealer",
          vin: "1HGCM82633A000000",
          mileage: 40000,
          dealVerdict: "go",
          valuation,
          dealAnalysis: {
            evidenceGates: {
              priceMeaningConfirmed: true,
              titleReviewed: true,
              conditionInspected: true,
              costsConfirmed: true,
            },
          },
        }).acquisitionReady,
      ).toBe(false);
    }
  });
});

describe("assessDecisionEvidence liveness", () => {
  it("never calls a frozen copart amount a current auction price", () => {
    const evidence = assessDecisionEvidence({
      source: "copart",
      askPrice: 4200,
      sourceUrl: "https://www.copart.com/lot/1",
      lastSeenAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    } as any);
    expect(evidence.state).toBe("not_live");
    expect(evidence.acquisitionReady).toBe(false);
    expect(evidence.label).toMatch(/not live/i);
    expect(evidence.summary).not.toMatch(/is a current auction price/);
  });
  it("leaves fresh rows to the normal checks", () => {
    const evidence = assessDecisionEvidence({
      source: "independent_dealer",
      askPrice: 9000,
      lastSeenAt: new Date().toISOString(),
    } as any);
    expect(evidence.state).not.toBe("not_live");
  });
});
