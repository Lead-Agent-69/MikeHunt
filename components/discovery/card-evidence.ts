import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";
import type { DiscoveryDeal } from "./types";

export function discoveryEvidence(deal: DiscoveryDeal) {
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
