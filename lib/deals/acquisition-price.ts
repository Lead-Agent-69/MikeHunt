type PriceRow = {
  ask_price?: unknown;
  askPrice?: unknown;
  buy_now_price?: unknown;
  buyNowPrice?: unknown;
  metadata?: Record<string, unknown> | null;
  options?: Record<string, any> | null;
};

export type PriceEvidence = {
  kind: "current_bid" | "buy_now" | "reference" | "unknown";
  currentBid?: number;
  buyNow?: number;
  referenceValue?: number;
};

export function positivePrice(value: unknown): number | undefined {
  const n =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** A pre-loss value is not an acquisition price; retain it only as reference evidence. */
export function reportedAcquisitionPrice(row: PriceRow): number {
  const evidence = row.options?.priceEvidence;
  if (
    evidence?.kind === "reference" ||
    evidence?.kind === "unknown" ||
    row.metadata?.price_is_acv_estimate === true
  )
    return 0;
  if (evidence?.kind === "current_bid")
    return positivePrice(evidence.currentBid) || 0;
  if (evidence?.kind === "buy_now") return positivePrice(evidence.buyNow) || 0;
  return positivePrice(row.ask_price ?? row.askPrice) || 0;
}
