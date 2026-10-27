import { hostOf, hostMatches } from "@/lib/net/host-match";
import { US_STATES } from "@/lib/geo/us-states";
import {
  isCustomerInventory,
  listingPhotos,
} from "@/lib/search/customer-inventory";
import { isInVehicleScope } from "@/lib/vehicle/vehicle-scope";
import { listingPriceEvidence } from "@/lib/deals/acquisition-price";
import { CURATED_SITES } from "./curated-sites";
import { SITE_POLICY_BLOCKS } from "./source-compliance";
import type { CachedListing } from "./local-cache";

export const PENDING_DEALER_MAX_AGE_MS = 24 * 60 * 60_000;

/** Recovery is not a new observation. Keep source timestamps, and never replay gated hosts. */
export function pendingDealerIntake(
  entries: Iterable<CachedListing>,
  states: readonly string[],
  limit = 25,
  now = Date.now(),
) {
  const wanted = new Set(
    states.filter((state) =>
      Object.prototype.hasOwnProperty.call(US_STATES, state),
    ),
  );
  const cap = Math.max(0, Math.min(25, Math.floor(limit) || 0));
  if (!wanted.size || !cap) return [];
  const canonicalHost = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) return undefined;
      return hostOf(parsed.href)?.replace(/^www\./, "");
    } catch {
      return undefined;
    }
  };
  const allowed = new Set(CURATED_SITES.map((site) => canonicalHost(site.url)));
  const groups = new Map<string, Record<string, any>[]>();
  for (const entry of Array.from(entries)) {
    const row = entry.data as Record<string, any> | undefined;
    if (
      entry.synced ||
      entry.recoveryExisting ||
      !row ||
      row.source !== "independent_dealer" ||
      !row.source_deal_id ||
      !wanted.has(row.location_state)
    )
      continue;
    const host = canonicalHost(row.source_url);
    if (
      !host ||
      !allowed.has(host) ||
      Object.keys(SITE_POLICY_BLOCKS).some((blocked) =>
        hostMatches(host, blocked),
      )
    )
      continue;
    const observedAt = Date.parse(row.last_seen_at);
    if (
      !Number.isFinite(observedAt) ||
      now - observedAt > PENDING_DEALER_MAX_AGE_MS ||
      !isCustomerInventory(row, now) ||
      !isInVehicleScope(row) ||
      !listingPhotos(row.images, row.options?.photoAudit).length
    )
      continue;
    if (
      !Number.isInteger(row.year) ||
      row.year <= 1900 ||
      row.year > new Date(now).getUTCFullYear() + 1 ||
      !row.make ||
      !row.model ||
      typeof row.ask_price !== "number" ||
      !Number.isFinite(row.ask_price) ||
      row.ask_price <= 0
    )
      continue;
    const price = listingPriceEvidence(row);
    if (
      (price && !["asking", "buy_now"].includes(price.kind)) ||
      row.deal_analysis?.priceImplausible ||
      ["typo", "implausible"].includes(row.deal_analysis?.priceSanity)
    )
      continue;
    // The caller orders buyer markets before surrounding states. Preserve that
    // priority instead of letting an alphabetically early neighbour consume intake.
    const groupKey = `${row.location_state}|${host}`;
    const group = groups.get(groupKey) || [];
    group.push(row);
    groups.set(groupKey, group);
  }
  // Give small local dealers a slot before a large site's retained inventory fills the batch.
  for (const rows of Array.from(groups.values()))
    rows.sort(
      (a, b) =>
        Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at) ||
        String(a.source_deal_id).localeCompare(String(b.source_deal_id)),
    );
  const stateOrder = Array.from(wanted);
  const queues = Array.from(groups)
    .sort(
      ([a], [b]) =>
        stateOrder.indexOf(a.split("|")[0]) -
          stateOrder.indexOf(b.split("|")[0]) || a.localeCompare(b),
    )
    .map(([, rows]) => rows);
  const selected: Record<string, any>[] = [];
  for (let offset = 0; selected.length < cap; offset++) {
    let found = false;
    for (const queue of queues) {
      if (!queue[offset]) continue;
      selected.push({ ...queue[offset] });
      found = true;
      if (selected.length === cap) break;
    }
    if (!found) break;
  }
  return selected;
}
