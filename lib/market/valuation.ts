import { hasRecentSoldEvidence } from "@/lib/valuation/evidence-confidence";
import {
  listingIdentityWarning,
  type ListingIdentity,
} from "@/lib/vehicle/listing-identity";

export type MarketValuation = {
  label: string;
  supported: boolean;
};

/** A stored baseline or the listing's own ask cannot support resale/profit claims. */
export function marketValuation(
  raw: unknown,
  estimate: unknown,
  identity?: ListingIdentity,
): MarketValuation {
  if (identity && listingIdentityWarning(identity))
    return { label: "Vehicle identity needs verification", supported: false };
  const unavailable = {
    label: "Resale needs comparable evidence",
    supported: false,
  };
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof estimate !== "number" ||
    !Number.isFinite(estimate) ||
    estimate <= 0
  )
    return unavailable;
  const v = raw as Record<string, unknown>;
  if (v.resaleEvidence !== true) return unavailable;
  if (
    v.source === "third_party" &&
    typeof v.kbbValue === "number" &&
    Number.isFinite(v.kbbValue) &&
    v.kbbValue > 0
  )
    return { label: "Attached market guide · estimate", supported: true };
  if (
    v.source !== "comparables" ||
    typeof v.compCount !== "number" ||
    !Number.isInteger(v.compCount) ||
    v.compCount < 3 ||
    !["low", "medium", "high"].includes(String(v.confidence))
  )
    return unavailable;
  const sold =
    v.compKind === "sold" &&
    hasRecentSoldEvidence({
      soldCount: typeof v.soldCount === "number" ? v.soldCount : undefined,
      soldAnchored: v.soldAnchored === true,
      soldAt: typeof v.soldAt === "string" ? v.soldAt : undefined,
    });
  if (!sold && v.compKind !== "ask") return unavailable;
  return {
    label: `${v.compCount.toLocaleString("en-US")} ${sold ? "dated sale" : "asking-price"} comparisons · ${v.confidence} confidence`,
    supported: true,
  };
}
