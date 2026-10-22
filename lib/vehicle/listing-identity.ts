export type ListingIdentity = {
  title?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
};

/** Flag a direct disagreement, never infer a replacement model from an image or low price. */
export function listingIdentityWarning(row: ListingIdentity): string | null {
  if (
    typeof row.title !== "string" ||
    typeof row.make !== "string" ||
    typeof row.model !== "string" ||
    !Number.isInteger(row.year)
  )
    return null;
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const title = normalize(row.title);
  const make = normalize(row.make);
  const model = normalize(row.model);
  if (
    !make ||
    !model ||
    ["unknown", "other", "unspecified"].includes(model) ||
    !title.startsWith(`${row.year}${make}`)
  )
    return null;
  if (title.includes(model)) return null;
  return "Listing name and recorded model differ. Confirm vehicle identity before relying on comparisons.";
}

/** Preserve observed listing facts; remove model-dependent conclusions until identity is resolved. */
export function withholdConflictingEconomics<T extends ListingIdentity>(
  row: T,
): T {
  if (!listingIdentityWarning(row)) return row;
  const safe = { ...row } as Record<string, unknown>;
  for (const key of [
    "sellEstimate",
    "sell_estimate",
    "mmrValue",
    "mmr_value",
    "profitEstimate",
    "profit_estimate",
    "profitScore",
    "profit_score",
    "true_net_profit",
    "trueNetProfit",
    "recommendedMaxBid",
    "recommended_max_bid",
    "ai_wholesale_estimate",
    "ai_retail_estimate",
    "ai_rationale",
    "is_arbitrage_opportunity",
    "dealAnalysis",
    "deal_analysis",
    "dealVerdict",
    "deal_verdict",
  ])
    delete safe[key];
  return safe as T;
}
