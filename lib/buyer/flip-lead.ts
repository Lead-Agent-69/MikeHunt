// Personal, DIY, and parts buyers should not see an ask-haircut called profit.
// Reseller and dealer modes keep the flip lead. A missing mode is personal.

export type FlipLeadMode =
  | "personal"
  | "diy"
  | "parts"
  | "reseller"
  | "dealer";

export function normalizeFlipLeadMode(
  value: unknown,
): FlipLeadMode | undefined {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (raw === "personal" || raw === "personal-buyer") return "personal";
  if (raw === "diy" || raw === "enthusiast") return "diy";
  if (raw === "parts" || raw === "parts-buyer" || raw === "teardown")
    return "parts";
  if (raw === "reseller" || raw === "independent-reseller") return "reseller";
  if (raw === "dealer" || raw === "team" || raw === "dealer-team")
    return "dealer";
  return undefined;
}

/** Flip desks may keep the existing profit lead. Everyone else may not. */
export function isFlipBuyerMode(value: unknown): boolean {
  const mode = normalizeFlipLeadMode(value);
  return mode === "reseller" || mode === "dealer";
}

type AnalysisLike = {
  soldAnchored?: boolean;
  sellBasis?: string;
  valuation?: {
    soldAnchored?: boolean;
    source?: string;
    basis?: string;
  };
};

/**
 * True only when a stored analysis is anchored to real sold comps.
 * An asking-price haircut is not a sold comp, even if a profit field is set.
 */
export function isSoldCompAnchored(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  const row = analysis as AnalysisLike;
  const source = row.valuation?.source;
  if (source === "asking_price") return false;
  const basis = row.sellBasis || row.valuation?.basis;
  const flagged =
    row.soldAnchored === true || row.valuation?.soldAnchored === true;
  if (!flagged) return false;
  if (basis === "market" && source !== "comparables") return false;
  return true;
}
