import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";
import type { DiscoveryDeal } from "./types";
import { sourceMeta } from "@/lib/sources/source-meta";
import type { ConditionRead } from "@/lib/intelligence/condition";
import { conditionDisplayLabel } from "@/lib/deals/condition-display";

export function discoveryConditionLabel(
  condition: ConditionRead,
  deal?: DiscoveryDeal,
): string {
  return conditionDisplayLabel(condition, {
    ...deal,
    titleType: deal?.titleClass,
  });
}

export function discoveryEvidence(deal: DiscoveryDeal) {
  const channel = sourceMeta(deal.source).channel;
  if (
    (channel === "dealer" || channel === "retail") &&
    (deal.lane === "auction" || deal.sellerType === "auction")
  ) {
    return {
      state: "needs_evidence" as const,
      label: "Sale terms unclear",
      summary: "The listing's sale type conflicts with its source information.",
      nextCheck:
        "Confirm whether this is an asking price or auction bid, then verify title, condition and purchase costs.",
      acquisitionReady: false,
      saleTermsUnclear: true,
    };
  }
  // Summary records do not include completed inspection and purchase checks.
  return assessDecisionEvidence({
    source:
      deal.lane === "auction" || deal.sellerType === "auction"
        ? "copart"
        : deal.source,
    condition: `${deal.condition || ""} ${deal.titleClass || ""} ${deal.lane === "repairable" ? "repairable" : ""}`,
    damageType: deal.damageType,
    vin: deal.vin,
    mileage: deal.mileage,
    dealVerdict: deal.dealVerdict,
    dealAnalysis: {
      priceImplausible: deal.warnings?.some((warning) =>
        /price.*(?:implausible|typo)|implausible.*price/i.test(warning),
      ),
    },
  });
}

export function discoveryReason(reason: string) {
  return reason
    .replace(/source link verified/gi, "Source link available")
    .replace(/photo backed/gi, "Listing photos available");
}
