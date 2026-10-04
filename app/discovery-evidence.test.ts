import { describe, expect, it } from "vitest";
import {
  discoveryEvidence,
  discoveryReason,
} from "@/components/discovery/card-evidence";
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
  it("does not turn model profit into a buy recommendation", () => {
    expect(discoveryEvidence(listing).acquisitionReady).toBe(false);
    expect(discoveryEvidence(listing).label).toBe("Needs evidence");
  });
  it("separates auction amounts from purchase readiness", () => {
    const result = discoveryEvidence({ ...listing, lane: "auction" });
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
});
