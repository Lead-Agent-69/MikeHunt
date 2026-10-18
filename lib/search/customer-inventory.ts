import { STALE_AFTER_HOURS } from "@/lib/deals/freshness";
import { photoEvidence } from "@/lib/images/photo-evidence";

/** Apply before count/range so empty galleries and stale rows cannot consume a page. */
export function applyCustomerInventory<T>(
  query: T,
  now = Date.now(),
  options: { includeWithoutPhotos?: boolean } = {},
): T {
  let scoped = query as any;
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
      new Date(now - STALE_AFTER_HOURS * 3_600_000).toISOString(),
    )
    .lte("last_seen_at", new Date(now).toISOString());
}

/** Syntax validation only: an accepted URL is not proof that its image still loads. */
export function reportedListingPhotos(value: unknown): string[] {
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
  ).slice(0, 20);
}

export function listingPhotos(value: unknown, audit?: unknown): string[] {
  return photoEvidence(reportedListingPhotos(value), audit).images;
}

/** Reported placeholders may remain researchable; this is not photo verification. */
export function isCustomerInventory(
  row: {
    images?: unknown;
    last_seen_at?: unknown;
    active?: boolean;
    options?: { photoAudit?: { state?: string } } | null;
  },
  now = Date.now(),
): boolean {
  const seen =
    typeof row.last_seen_at === "string" ? Date.parse(row.last_seen_at) : NaN;
  return (
    row.active !== false &&
    row.options?.photoAudit?.state !== "unavailable" &&
    reportedListingPhotos(row.images).length > 0 &&
    Number.isFinite(seen) &&
    seen <= now &&
    now - seen <= STALE_AFTER_HOURS * 3_600_000
  );
}
