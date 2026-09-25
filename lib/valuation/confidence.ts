// lib/valuation/confidence.ts
// Honest confidence for a resale estimate, derived from what actually backs the number. Real sold-price
// anchored comps = high; live retail comps = good; a market aggregate = fair; an offline baseline =
// estimate only. Shared by the deal page and the discovery cards so the signal is consistent — a dealer
// should trust a comp-backed number and discount a baseline guess, at a glance, before clicking in.

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
    blurb: "Anchored to real sold prices",
  },
  good: {
    label: "Good",
    color: "var(--green)",
    blurb: "Backed by live retail comps",
  },
  fair: {
    label: "Fair",
    color: "var(--amber)",
    blurb: "From a market aggregate",
  },
  estimate: {
    label: "Estimate",
    color: "var(--t4)",
    blurb: "Baseline only — thin comp data",
  },
};
