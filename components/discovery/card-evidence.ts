import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";
import type { DiscoveryDeal } from "./types";

export function discoveryEvidence(deal: DiscoveryDeal) {
  // Summary records do not include completed inspection and purchase checks.
  // Non-live rows (frozen gated import, stale, ended) get the honest "not live" evidence, judged
  // from the row's real source rather than the auction stand-in below.
  const notLive = deal.freshness ? !deal.freshness.live : false;
  return assessDecisionEvidence({
    ...(notLive
      ? {
          sourceUrl: deal.sourceUrl,
          lastSeenAt: deal.lastSeenAt ?? null,
          auctionEndAt: (deal as any).auctionEndAt ?? null,
        }
      : {}),
    source:
      !notLive && (deal.lane === "auction" || deal.sellerType === "auction")
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
