import { describe, expect, it } from "vitest";
import { briefCandidate } from "./__fixtures__/brief-candidate";
import { dealBriefEvidence } from "./deal-brief-evidence";

describe("deal brief evidence", () => {
  it("requires current cash price, inspected costs, identity and dated completed sales", () => {
    const candidate = briefCandidate();
    expect(dealBriefEvidence(candidate).ready).toBe(true);
    const cases = [
      { active: false },
      { vin: undefined },
      { model: "Civic" },
      { mileage: null },
      { title_source: undefined },
      { title_source: "source_default" },
      { source_url: null },
      { last_seen_at: "2020-01-01" },
      { last_seen_at: new Date(Date.now() - 4 * 86400000).toISOString() },
      { auction_end_at: "2020-01-01" },
      { price_evidence: { kind: "current_bid", currentBid: 10000 } },
      { price_evidence: { kind: "down_payment", listedAmount: 10000 } },
      { price_evidence: { kind: "reference", referenceValue: 10000 } },
      {
        price_evidence: {
          kind: "asking",
          askingPrice: 10000,
          checkedAt: "2020-01-01",
        },
      },
      { true_net_profit: NaN },
      { recommended_max_bid: null },
      { deal_analysis: { ...candidate.deal_analysis, evidenceGates: {} } },
      {
        deal_analysis: {
          ...candidate.deal_analysis,
          valuation: {
            ...candidate.deal_analysis.valuation,
            soldAt: "2020-01-01",
          },
        },
      },
    ];
    for (const fields of cases)
      expect(
        dealBriefEvidence({ ...candidate, ...fields }).ready,
        JSON.stringify(fields),
      ).toBe(false);
  });

  it("does not invalidate a cache merely because the cache metadata was written", () => {
    const d = briefCandidate();
    const before = dealBriefEvidence(d).key;
    Object.assign(d.deal_analysis, {
      aiBrief: "text",
      aiBriefAt: new Date().toISOString(),
      aiBriefUserId: "user-a",
      aiBriefEvidenceKey: before,
    });
    expect(dealBriefEvidence(d).key).toBe(before);
    d.deal_analysis.costs.repair += 100;
    expect(dealBriefEvidence(d).key).not.toBe(before);
  });
});
