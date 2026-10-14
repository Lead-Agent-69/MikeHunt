import { describe, expect, it } from "vitest";
import type { DealAnalysis } from "./deal-analyzer";
import { rescoreUpdate } from "./rescore-update";

const analysis = {
  verdict: "go",
  score: 150,
  profit: 2000,
  sellEstimate: 15000,
  recommendedMaxBid: 9000,
  repairCost: 400,
  transportCost: 600,
  valuation: { source: "comparables", compCount: 5 },
  warnings: ["Verify title"],
  sellBasis: "comps",
} as unknown as DealAnalysis;
const row = {
  ask_price: 10000,
  source: "truecar",
  title: "2020 Hyundai Kona",
  mmr_value: 14000,
};

describe("rescore persistence integrity", () => {
  it("uses real cost columns and preserves the evidence and original benchmark", () => {
    const patch = rescoreUpdate(
      { ...row, deal_analysis: { qualityFlags: [], retained: "source proof" } },
      analysis,
    );
    expect(patch).toMatchObject({
      estimated_repair_cost: 400,
      estimated_transport_cost: 600,
      profit_score: 100,
      true_net_profit: 2000,
      deal_verdict: "go",
      is_arbitrage_opportunity: true,
    });
    expect(patch.deal_analysis).toMatchObject({
      retained: "source proof",
      valuation: analysis.valuation,
      acquisitionPriceMissing: false,
      warnings: analysis.warnings,
    });
    for (const removed of [
      "repair_estimate",
      "transport_estimate",
      "score_updated_at",
      "mmr_value",
      "profit_estimate",
    ])
      expect(patch).not.toHaveProperty(removed);
  });
  it.each([
    "unknown",
    "down_payment",
    "monthly_payment",
    "reference",
    "finance_teaser",
  ])("keeps %s amounts out of actionable math", (kind) => {
    const patch = rescoreUpdate(
      { ...row, options: { priceEvidence: { kind, listedAmount: 4545 } } },
      analysis,
    );
    expect(patch).toMatchObject({
      sell_estimate: null,
      recommended_max_bid: null,
      true_net_profit: null,
      profit_score: 0,
      deal_verdict: "not_enough_data",
      is_arbitrage_opportunity: false,
    });
    expect(patch.deal_analysis.acquisitionPriceMissing).toBe(true);
    expect(patch.deal_analysis.costs.total).toBeNull();
  });
  it("does not promote a quarantined quality row", () => {
    expect(
      rescoreUpdate(
        { ...row, deal_analysis: { qualityFlags: ["vin_bad_format"] } },
        analysis,
      ),
    ).toMatchObject({
      deal_verdict: "pass",
      sell_estimate: null,
      true_net_profit: null,
      profit_score: 0,
      is_arbitrage_opportunity: false,
    });
  });
});
