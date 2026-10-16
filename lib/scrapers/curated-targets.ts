import { hostMatches, hostOf } from "@/lib/net/host-match";
import { matchesRequestedDealer } from "@/lib/sources/source-meta";

/** Explicit targets must never turn into an unrestricted catalog crawl. */
export function matchesCuratedTarget(
  site: { url: string; inventoryUrl?: string },
  dealerSourceIds: string[] = [],
  dealerHosts: string[] = [],
) {
  if (!dealerSourceIds.length && !dealerHosts.length) return true;
  return (
    (dealerSourceIds.length > 0 &&
      matchesRequestedDealer(site, dealerSourceIds)) ||
    dealerHosts.some(
      (host) =>
        hostMatches(hostOf(site.url), host) ||
        hostMatches(hostOf(site.inventoryUrl), host),
    )
  );
}
