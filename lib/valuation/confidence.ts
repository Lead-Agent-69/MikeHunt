// Display the recorded evidence confidence, never upgrade it from a basis label alone.
export type ValueConfidence = "high" | "good" | "fair" | "low" | "estimate";

type ConfidenceEvidence = {
  confidence?: unknown;
  source?: unknown;
  compKind?: unknown;
  compCount?: unknown;
  soldCount?: unknown;
  resaleEvidence?: unknown;
};

export function valueConfidence(
  sellBasis?: string | null,
  soldAnchored?: boolean | null,
  evidence?: ConfidenceEvidence | null,
): ValueConfidence {
  if (!evidence || evidence.resaleEvidence === false) return "estimate";
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  const hasComps =
    sellBasis === "comps" &&
    evidence.source === "comparables" &&
    (evidence.compKind === "ask" || evidence.compKind === "sold") &&
    count(evidence.compCount) >= 3;
  const hasGuide =
    evidence.source === "third_party" && evidence.resaleEvidence === true;
  if (!hasComps && !hasGuide) return "estimate";
  if (evidence.confidence === "low") return "low";
  if (evidence.confidence === "medium") return "good";
  if (evidence.confidence !== "high") return "estimate";
  // Asking prices alone cannot establish high confidence in a completed-sale value.
  const hasSales =
    (evidence.compKind === "sold" && count(evidence.compCount) >= 3) ||
    (soldAnchored === true && count(evidence.soldCount) >= 3);
  return hasSales ? "high" : "good";
}

export const CONFIDENCE_META: Record<
  ValueConfidence,
  { label: string; color: string; blurb: string }
> = {
  high: {
    label: "High",
    color: "var(--green)",
    blurb:
      "Recorded high confidence with source-reported sale evidence; not a guaranteed sale price",
  },
  good: {
    label: "Medium",
    color: "var(--amber)",
    blurb:
      "Recorded evidence supports a market estimate; asking prices are not completed sales",
  },
  fair: {
    label: "Limited",
    color: "var(--amber)",
    blurb: "Limited market evidence; confirm price, title, condition and costs",
  },
  low: {
    label: "Low",
    color: "var(--amber)",
    blurb:
      "The recorded model reports low confidence; verify the comparable evidence before relying on this estimate",
  },
  estimate: {
    label: "Unrated",
    color: "var(--t4)",
    blurb:
      "Insufficient or unrecorded confidence evidence; research reference only",
  },
};
