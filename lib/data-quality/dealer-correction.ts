type CorrectionRow = {
  source: string;
  source_url: string;
  ask_price: number;
  mileage: number | null;
  vin?: string | null;
  options?: Record<string, any> | null;
  damage_type?: string | null;
};

export type DealerCorrectionEvidence = {
  sourceUrl: string;
  askingPrice: number;
  mileage: number;
  vin: string;
  condition: "clean_title" | "rebuilt_title" | "salvage_title";
  checkedAt: string;
};

export function correctedPriceHistoryCutoff(
  row?: { source_url?: string; options?: Record<string, any> | null } | null,
): string | undefined {
  const correction = row?.options?.sourceCorrection;
  if (
    correction?.version !== "drivenation-price-odometer-v1" ||
    correction.sourceUrl !== row?.source_url ||
    !row?.source_url?.startsWith(
      "https://www.drivenation.com/vehiclesDetail.php?",
    ) ||
    !Number.isFinite(Date.parse(correction.checkedAt))
  )
    return undefined;
  return correction.checkedAt;
}

export function driveNationCorrection(
  row: CorrectionRow,
  evidence: DealerCorrectionEvidence,
) {
  const url = new URL(evidence.sourceUrl);
  if (
    row.source !== "independent_dealer" ||
    row.source_url !== evidence.sourceUrl ||
    url.protocol !== "https:" ||
    url.hostname !== "www.drivenation.com" ||
    url.pathname !== "/vehiclesDetail.php" ||
    !/^\?(?:ID=)?\d+$/i.test(url.search)
  )
    throw new Error("Correction source identity mismatch");
  if (
    !/^[A-HJ-NPR-Z0-9]{17}$/.test(evidence.vin) ||
    (row.vin && row.vin !== evidence.vin)
  )
    throw new Error("Correction VIN identity mismatch");
  if (
    !Number.isFinite(evidence.askingPrice) ||
    evidence.askingPrice < 100 ||
    evidence.askingPrice >= 2_000_000 ||
    !Number.isInteger(evidence.mileage) ||
    evidence.mileage < 0 ||
    evidence.mileage >= 1_000_000 ||
    !Number.isFinite(Date.parse(evidence.checkedAt))
  )
    throw new Error("Correction evidence is invalid");
  return {
    ask_price: evidence.askingPrice,
    mileage: evidence.mileage,
    vin: evidence.vin,
    condition: evidence.condition,
    // This source's old generic default was not observed vehicle damage.
    damage_type: row.damage_type === "repairable" ? null : row.damage_type,
    options: {
      ...(row.options || {}),
      titleSource: "listing",
      priceEvidence: {
        kind: "asking",
        askingPrice: evidence.askingPrice,
        listedAmount: evidence.askingPrice,
        checkedAt: evidence.checkedAt,
        evidenceText:
          "Seller All In Price. Confirm taxes, title and registration separately.",
      },
      sourceCorrection: {
        version: "drivenation-price-odometer-v1",
        ...evidence,
        previousImportedAmount: row.ask_price,
        previousImportedMileage: row.mileage,
      },
    },
    // Never keep a verdict or resale number calculated from the invalid price/miles.
    sell_estimate: null,
    true_net_profit: null,
    recommended_max_bid: null,
    profit_score: 0,
    deal_verdict: "not_enough_data",
    is_arbitrage_opportunity: false,
    ai_retail_estimate: null,
    ai_wholesale_estimate: null,
    ai_rationale: null,
    pricing_breakdown: null,
    deal_analysis: {
      recommendations: [
        "Seller price and mileage corrected. Fresh valuation evidence is needed before judging this vehicle.",
      ],
      acquisitionPriceMissing: false,
      valuation: { source: "unavailable", compCount: 0, soldAnchored: false },
      soldAnchored: false,
      sourceCorrection: evidence,
    },
    last_seen_at: evidence.checkedAt,
  };
}
