import {
  dbSourceValues,
  INVENTORY_SOURCE_FILTERS,
  sourceUrlNeedles,
} from "@/lib/search/inventory-filters";
import {
  dealerSourceIdForHost,
  sourceFromUrl,
} from "@/lib/sources/source-meta";
import { hostMatches, hostOf } from "@/lib/net/host-match";
import { SITE_POLICY_BLOCKS } from "@/lib/scrapers/source-compliance";
import { ALL_VEHICLE_SOURCES } from "@/lib/utils/sources";
import type { SourceCoverage } from "@/lib/search/source-coverage";

// Publish only catalog IDs requiring review, never worker configuration or raw policy records.
// An operator override is not evidence of permission, so use the reviewed policy inventory.
const accessReviewIds = INVENTORY_SOURCE_FILTERS.filter(({ id }) => {
  const hosts = [...sourceUrlNeedles(id)];
  const registered = ALL_VEHICLE_SOURCES.find((source) => source.id === id);
  if (registered) {
    const host = hostOf(registered.url);
    if (host) hosts.push(host);
  }
  return hosts.some((host) =>
    Object.keys(SITE_POLICY_BLOCKS).some((blocked) =>
      hostMatches(host, blocked),
    ),
  );
}).map(({ id }) => id);

export function marketSourceCoverage(
  rows: readonly { source: string; sourceUrl?: string }[],
  capped: boolean,
): SourceCoverage {
  const stored = new Map<string, number>();
  const counts: Record<string, number> = {};
  const dealers = new Map<string, string | null>();
  for (const row of rows) {
    stored.set(row.source, (stored.get(row.source) || 0) + 1);
    const host = hostOf(row.sourceUrl);
    if (!host) continue;
    if (!dealers.has(host))
      dealers.set(
        host,
        dealerSourceIdForHost(host) || sourceFromUrl(`https://${host}`),
      );
    const id = dealers.get(host);
    if (
      id &&
      sourceUrlNeedles(id).length &&
      dbSourceValues(id).includes(row.source)
    )
      counts[id] = (counts[id] || 0) + 1;
  }
  for (const { id } of INVENTORY_SOURCE_FILTERS) {
    if (sourceUrlNeedles(id).length) continue;
    const n = dbSourceValues(id).reduce(
      (sum, source) => sum + (stored.get(source) || 0),
      0,
    );
    if (n) counts[id] = n;
  }
  return { counts, complete: !capped, accessReviewIds };
}
