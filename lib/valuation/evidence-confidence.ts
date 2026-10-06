export function evidenceConfidence(input: {
  source?: string;
  confidence?: string;
  compCount?: number;
  soldCount?: number;
  soldAnchored?: boolean;
}): "High" | "Medium" | "Low" {
  if (input.source === "comparables" && (input.compCount || 0) >= 3) {
    if (
      input.soldAnchored &&
      (input.soldCount || 0) >= 3 &&
      input.confidence === "high"
    ) {
      return "High";
    }
    return input.confidence === "none" ? "Low" : "Medium";
  }
  return input.source === "third_party" && input.confidence !== "none"
    ? "Medium"
    : "Low";
}
