import {
  readCondition,
  type ConditionRead,
} from "@/lib/intelligence/condition";
import { isAuctionChannel, sourceMeta } from "@/lib/sources/source-meta";

type ConditionContext = {
  source?: string | null;
  condition?: string | null;
  damageType?: string | null;
  titleType?: string | null;
  lane?: string | null;
};

const TITLE_ONLY = /^(clean title|rebuilt title|salvage)$/i;

/** Missing auction facts are useful for risky lots, not a warning on ordinary retail inventory. */
export function needsOperabilityFacts(listing: ConditionContext): boolean {
  const condition = readCondition(listing.condition, listing.damageType);
  const titleOnly = TITLE_ONLY.test(
    condition?.label || readCondition(listing.titleType)?.label || "",
  );
  const channel = sourceMeta(listing.source).channel;
  return (
    isAuctionChannel(listing.source) ||
    (listing.lane === "auction" &&
      channel !== "dealer" &&
      channel !== "retail") ||
    ((listing.lane === "salvage" || listing.lane === "repairable") &&
      !titleOnly) ||
    Boolean(condition?.detail) ||
    Boolean(
      condition &&
      condition.tier !== "good" &&
      condition.label !== "Certification reported" &&
      !TITLE_ONLY.test(condition.label),
    )
  );
}

export function conditionDisplayLabel(
  condition: ConditionRead,
  listing: ConditionContext = {},
): string {
  if (condition.runs === "unknown" && TITLE_ONLY.test(condition.label)) {
    return needsOperabilityFacts({
      ...listing,
      condition: listing.condition || condition.label,
    })
      ? "Running status not reported"
      : "";
  }
  return condition.label;
}
