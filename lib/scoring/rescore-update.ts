import type { Deal } from "@/types";
import type { DealAnalysis } from "./deal-analyzer";
import { reportedAcquisitionPrice } from "@/lib/deals/acquisition-price";

type RescoreRow = Partial<Deal> & {
  deal_analysis?: Record<string, any> | null;
  quality_flags?: string[] | null;
};

/** Match ingestion's stored column names and retain the evidence behind the verdict. */
export function rescoreUpdate(row: RescoreRow, analysis: DealAnalysis) {
  const unpriced = reportedAcquisitionPrice(row) <= 0;
  const flags = row.quality_flags || row.deal_analysis?.qualityFlags || [];
  const flagged = Array.isArray(flags) && flags.length > 0;
  const safeMath = !unpriced && !flagged;
  const verdict = unpriced
    ? "not_enough_data"
    : flagged
      ? "pass"
      : analysis.verdict;
  return {
    sell_estimate: safeMath ? analysis.sellEstimate : null,
    recommended_max_bid: safeMath ? analysis.recommendedMaxBid : null,
    true_net_profit: safeMath ? analysis.profit : null,
    // Legacy profit_estimate is a generated column; net profit belongs above.
    estimated_repair_cost: analysis.repairCost,
    estimated_transport_cost: analysis.transportCost,
    profit_score: safeMath ? Math.min(100, Math.max(0, analysis.score)) : 0,
    deal_verdict: verdict,
    is_arbitrage_opportunity: verdict === "go",
    deal_analysis: {
      ...(row.deal_analysis || {}),
      acquisitionPriceMissing: unpriced,
      roi: safeMath ? Math.round(analysis.roi * 10) / 10 : null,
      profitMargin: safeMath
        ? Math.round(analysis.profitMargin * 10) / 10
        : null,
      breakEvenDay: analysis.breakEvenDay,
      transportMiles: analysis.miles,
      costs: {
        acquisition: safeMath ? analysis.acquisitionCost : null,
        repair: analysis.repairCost,
        transport: analysis.transportCost,
        holding: analysis.holdingCost,
        selling: analysis.sellingCost,
        total: safeMath ? analysis.totalCost : null,
      },
      sellBasis: analysis.sellBasis,
      valuation: analysis.valuation,
      scoreBreakdown: analysis.scoreBreakdown,
      recommendations: analysis.recommendations,
      priceImplausible: analysis.priceImplausible,
      conditionTag: analysis.conditionTag,
      soldAnchored: analysis.soldAnchored,
      wholesaleEstimate: analysis.wholesaleEstimate,
      priceSanity: analysis.priceSanity,
      inferredPrice: analysis.inferredPrice,
      warnings: analysis.warnings,
      prediction: analysis.prediction,
    },
  };
}
