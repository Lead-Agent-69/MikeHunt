import { evidenceConfidence } from "@/lib/valuation/evidence-confidence";
import type { DataQualityField, DataQualityGrade } from "@/lib/data-quality";

export function detailValuationConfidence(valuation?: {
  source?: string;
  confidence?: string;
  compCount?: number;
  sampleCount?: number;
  soldCount?: number;
  soldAnchored?: boolean;
}) {
  return evidenceConfidence({
    ...valuation,
    compCount: valuation?.compCount ?? valuation?.sampleCount,
  });
}

/** Only show fields relevant to this listing; dealer inventory does not need auction timing. */
export function listingChecklistFields(quality: DataQualityGrade) {
  const fields: DataQualityField[] = [
    "vin",
    "photo",
    "title",
    "damage",
    "mileage",
    "price",
    "location",
    "seller",
    "sellerContact",
    "source",
    "auction",
  ];
  return fields.filter(
    (field) =>
      quality.present.includes(field) || quality.missing.includes(field),
  );
}

export function sourceReadinessFallback(loading: boolean, failed: boolean) {
  if (loading)
    return {
      label: "Checking",
      summary: "Checking source coverage for this listing...",
      detail: "The listing's own last-seen time is shown above.",
    };
  if (failed)
    return {
      label: "Unavailable",
      summary: "Source coverage couldn't be checked right now.",
      detail:
        "Open the original listing to confirm availability. Your vehicle details are unchanged.",
    };
  return {
    label: "Not tracked",
    summary: "No matching source-health record is available for this listing.",
    detail:
      "This does not mean the vehicle is unavailable. Confirm with the seller using the original listing.",
  };
}
