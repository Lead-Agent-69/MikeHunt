import { hasRecentSoldEvidence } from "@/lib/valuation/evidence-confidence";

/** Legacy modeled values are not a purchase ceiling without confirmed costs and sold evidence. */
export function economicsEvidenceReady(analysis: any): boolean {
  const valuation = analysis?.valuation;
  const gates = analysis?.evidenceGates;
  return Boolean(
    valuation?.source === "comparables" &&
    ["medium", "high"].includes(valuation?.confidence) &&
    ["clean", "salvage"].includes(valuation?.soldLane) &&
    hasRecentSoldEvidence(valuation) &&
    gates?.priceMeaningConfirmed === true &&
    gates?.titleReviewed === true &&
    gates?.conditionInspected === true &&
    gates?.costsConfirmed === true,
  );
}
