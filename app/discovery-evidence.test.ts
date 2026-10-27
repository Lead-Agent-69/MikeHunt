import { describe, expect, it } from "vitest";
import {
  discoveryEvidence,
  discoveryReason,
  discoveryConditionLabel,
  discoveryValuation,
} from "@/components/discovery/card-evidence";
import { readCondition } from "@/lib/intelligence/condition";
import type { DiscoveryDeal } from "@/components/discovery/types";

const listing = {
  source: "dealer",
  condition: "",
  trueNetProfit: 14901,
  recommendedMaxBid: 12872,
  dealVerdict: "go",
  askPrice: 3000,
  sellEstimate: 24254,
} as DiscoveryDeal;

describe("discovery purchase evidence", () => {
  it("does not promote legacy sale flags or baselines into supported resale", () => {
    expect(
      discoveryValuation({ ...listing, soldAnchored: true, compCount: 20 })
        .supported,
    ).toBe(false);
    expect(
      discoveryValuation({
        ...listing,
        valuation: {
          source: "comparables",
          resaleEvidence: true,
          compKind: "ask",
          compCount: 4,
          confidence: "low",
        } as any,
      }).label,
    ).toContain("asking-price");
    expect(
      discoveryValuation({
        ...listing,
        valuation: {
          source: "comparables",
          resaleEvidence: true,
          compKind: "sold",
          compCount: 5,
          confidence: "high",
          soldAnchored: true,
          soldCount: 5,
          soldAt: "2020-01-01",
        } as any,
      }).supported,
    ).toBe(false);
  });
  it("does not turn model profit into a buy recommendation", () => {
    expect(discoveryEvidence(listing).acquisitionReady).toBe(false);
    expect(discoveryEvidence(listing).label).toBe("Needs evidence");
  });
  it("separates auction amounts from purchase readiness", () => {
    const result = discoveryEvidence({
      ...listing,
      source: "copart",
      lane: "auction",
    });
    expect(result.state).toBe("auction_watch");
    expect(result.acquisitionReady).toBe(false);
  });
  it("requires repair-aware checks for salvage title records", () => {
    expect(discoveryEvidence({ ...listing, titleClass: "salvage" }).state).toBe(
      "repairable",
    );
  });
  it("does not describe links and photos as verified findings", () => {
    expect(discoveryReason("source link verified, photo backed")).toBe(
      "Source link available, Listing photos available",
    );
  });
  it.each(["independent_dealer", "carvana", "cars_com"])(
    "flags conflicting auction claims on %s without inventing a Copart sale",
    (source) => {
      const result = discoveryEvidence({
        ...listing,
        source,
        sellerType: "auction",
      });
      expect(result.label).toBe("Sale terms unclear");
      expect(result.state).toBe("needs_evidence");
      expect(result.acquisitionReady).toBe(false);
      expect(result.nextCheck).toContain("asking price or auction bid");
      expect(result).toHaveProperty("saleTermsUnclear", true);
    },
  );
  it("preserves auction warnings for actual auction sources", () => {
    expect(discoveryEvidence({ ...listing, source: "copart" }).state).toBe(
      "auction_watch",
    );
  });
  it.each(["clean_title", "rebuilt_title", "salvage_title"])(
    "separates %s from unknown operability",
    (condition) => {
      expect(
        discoveryConditionLabel(readCondition(condition)!, {
          ...listing,
          source: "copart",
          condition,
        }),
      ).toBe("Running status not reported");
    },
  );
  it.each(["independent_dealer", "carvana", "cars_com", "craigslist"])(
    "does not label ordinary %s inventory as having missing running status",
    (source) => {
      expect(
        discoveryConditionLabel(readCondition("clean_title")!, {
          ...listing,
          source,
          condition: "clean_title",
        }),
      ).toBe("");
    },
  );
  it("keeps explicit operability and damage information", () => {
    expect(discoveryConditionLabel(readCondition("run_drive")!)).toBe(
      "Runs & drives",
    );
    expect(discoveryConditionLabel(readCondition("non_runner")!)).toBe(
      "Non-runner",
    );
    expect(
      discoveryConditionLabel(readCondition("repairable", "FRONT END")!),
    ).toBe("Needs work");
  });
});
