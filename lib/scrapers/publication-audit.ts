import { hostMatches, hostOf } from "@/lib/net/host-match";
import {
  customerInventoryExclusion,
  isCustomerInventory,
} from "@/lib/search/customer-inventory";
import { isInVehicleScope } from "@/lib/vehicle/vehicle-scope";

type Row = Omit<Parameters<typeof isCustomerInventory>[0], "options"> & {
  options?: {
    photoAudit?: { state?: string; placeholderUrls?: string[] };
    [key: string]: unknown;
  } | null;
  source_url?: string;
  title?: string;
  make?: string;
  model?: string;
  source?: string;
};
export type CachedPublicationObservation = { synced: boolean; data?: Row };

/** Bounded read-only proof: candidate counts are not personalized visibility or sold inventory. */
export function sourcePublicationAudit(
  host: string,
  entries: Iterable<CachedPublicationObservation>,
  stored: Row[],
  now = Date.now(),
) {
  const matches = (row: Row) => hostMatches(hostOf(row.source_url), host);
  let deferredObservations = 0;
  let recentDeferredCandidates = 0;
  for (const entry of Array.from(entries)) {
    if (entry.synced || !entry.data || !matches(entry.data)) continue;
    deferredObservations++;
    if (isCustomerInventory(entry.data, now) && isInVehicleScope(entry.data))
      recentDeferredCandidates++;
  }
  const rows = stored.filter(matches);
  const exclusions: Record<string, number> = {};
  for (const row of rows) {
    const reason =
      customerInventoryExclusion(row, now) ||
      (!isInVehicleScope(row) ? "outside_vehicle_scope" : null);
    if (reason) exclusions[reason] = (exclusions[reason] || 0) + 1;
  }
  const newest =
    rows
      .map((row) => row.last_seen_at)
      .filter(
        (seen): seen is string =>
          typeof seen === "string" && Number.isFinite(Date.parse(seen)),
      )
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return {
    host,
    deferredObservations,
    // These may be updates or duplicates, not necessarily new listings.
    recentDeferredCandidates,
    storedRowsInSample: rows.length,
    activeRowsInSample: rows.filter((row) => row.active === true).length,
    defaultInventoryCandidates: rows.filter(
      (row) => isCustomerInventory(row, now) && isInVehicleScope(row),
    ).length,
    // These sum to sampled rows minus candidates, not losses before storage.
    exclusions,
    photoReachabilityVerified: false,
    newestStoredObservation: newest,
  };
}
