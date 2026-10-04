// lib/valuation/confidence.ts
// Honest confidence for a resale estimate, derived from what actually backs the number. A sold blend
// (rare, damaged titles only) = high; ask-based comps = good; a market aggregate = fair; an offline
// baseline = estimate only. Shared by the deal page and the discovery cards so the signal is consistent.
// Wording only — ASK_TO_SOLD and the sold blend weight are not retuned here.

export type ValueConfidence = "high" | "good" | "fair" | "estimate";

export function valueConfidence(
  sellBasis?: string | null,
  soldAnchored?: boolean | null,
): ValueConfidence {
  if (sellBasis === "comps") return soldAnchored ? "high" : "good";
  if (sellBasis === "market") return "fair";
  return "estimate";
}

export const CONFIDENCE_META: Record<
  ValueConfidence,
  { label: string; color: string; blurb: string }
> = {
  high: {
    label: "High",
    color: "var(--green)",
    blurb: "Partly blended with completed sales",
  },
  good: {
    label: "Good",
    color: "var(--green)",
    blurb: "Ask-based comps",
  },
  fair: {
    label: "Fair",
    color: "var(--amber)",
    blurb: "Ask-based estimate from scraped asking prices, not a sold price",
  },
  estimate: {
    label: "Estimate",
    color: "var(--t4)",
    blurb: "Baseline only — thin comp data",
  },
};
