import { STALE_AFTER_HOURS } from "@/lib/deals/freshness";
import { photoEvidence } from "@/lib/images/photo-evidence";
import { inventoryObservedDays } from "@/lib/search/inventory-freshness";

/** Default to current photo-backed inventory; explicit research may widen to at most 30 days. */
export function applyCustomerInventory<T>(
  query: T,
  now = Date.now(),
  options: { includeWithoutPhotos?: boolean; observedDays?: number } = {},
): T {
  let scoped = query as any;
  const observedDays = inventoryObservedDays(options.observedDays);
  if (!options.includeWithoutPhotos)
    scoped = scoped
      .not("images", "is", null)
      .neq("images", "{}")
      .or(
        "options->photoAudit->>state.is.null,options->photoAudit->>state.neq.unavailable",
      );
  return scoped
    .gte(
      "last_seen_at",
      new Date(
        now -
          (observedDays ? observedDays * 24 : STALE_AFTER_HOURS) * 3_600_000,
      ).toISOString(),
    )
    .lte("last_seen_at", new Date(now).toISOString());
}

/** Syntax validation only: an accepted URL is not proof that its image still loads. */
export function reportedListingPhotos(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((item): item is string => {
        if (typeof item !== "string" || !item.trim()) return false;
        try {
          const url = new URL(item);
          return ["https:", "http:"].includes(url.protocol);
        } catch {
          return false;
        }
      }),
    ),
  ).slice(0, limit);
}

export function listingPhotos(
  value: unknown,
  auditOrLimit?: unknown,
): string[] {
  const limit = typeof auditOrLimit === "number" ? auditOrLimit : 20;
  const audit = typeof auditOrLimit === "number" ? undefined : auditOrLimit;
  return photoEvidence(reportedListingPhotos(value, limit), audit).images;
}

type InventoryObservation = {
  images?: unknown;
  last_seen_at?: unknown;
  active?: boolean;
  options?: {
    photoAudit?: { state?: string; placeholderUrls?: string[] };
  } | null;
};

/** One primary exclusion per row; unknown photo reachability is not unavailability. */
export function customerInventoryExclusion(
  row: InventoryObservation,
  now = Date.now(),
) {
  if (row.active === false) return "inactive";
  if (row.options?.photoAudit?.state === "unavailable")
    return "photos_unavailable";
  if (!reportedListingPhotos(row.images).length) return "missing_photos";
  if (!listingPhotos(row.images, row.options?.photoAudit).length)
    return "placeholder_photos";
  const seen =
    typeof row.last_seen_at === "string" ? Date.parse(row.last_seen_at) : NaN;
  if (!Number.isFinite(seen)) return "unobserved";
  if (seen > now) return "future_observation";
  if (now - seen > STALE_AFTER_HOURS * 3_600_000) return "stale";
  return null;
}

export function isCustomerInventory(
  row: InventoryObservation,
  now = Date.now(),
): boolean {
  return customerInventoryExclusion(row, now) === null;
}
