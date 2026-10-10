/** Mirrors the current 180-day sold-observation window; undated claims are not evidence. */
export function hasRecentSoldEvidence(
  input: {
    soldCount?: number;
    soldAnchored?: boolean;
    soldAt?: string | null;
  },
  now = Date.now(),
): boolean {
  const stamp = Date.parse(input.soldAt || "");
  return (
    input.soldAnchored === true &&
    typeof input.soldCount === "number" &&
    Number.isFinite(input.soldCount) &&
    input.soldCount >= 3 &&
    Number.isInteger(input.soldCount) &&
    Number.isFinite(stamp) &&
    stamp <= now &&
    now - stamp <= 180 * 86400000
  );
}

export function evidenceConfidence(input: {
  source?: string;
  confidence?: string;
  compCount?: number;
  soldCount?: number;
  soldAnchored?: boolean;
  soldAt?: string | null;
}): "High" | "Medium" | "Low" {
  if (
    input.source === "comparables" &&
    Number.isInteger(input.compCount) &&
    (input.compCount || 0) >= 3
  ) {
    if (hasRecentSoldEvidence(input) && input.confidence === "high") {
      return "High";
    }
    return ["high", "medium"].includes(input.confidence || "")
      ? "Medium"
      : "Low";
  }
  return input.source === "third_party" &&
    ["high", "medium"].includes(input.confidence || "")
    ? "Medium"
    : "Low";
}
