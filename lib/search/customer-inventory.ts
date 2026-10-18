import { STALE_AFTER_HOURS } from "@/lib/deals/freshness";

/** Apply before count/range so empty galleries and stale rows cannot consume a page. */
export function applyCustomerInventory<T>(query: T, now = Date.now()): T {
  return (query as any)
    .not("images", "is", null)
    .neq("images", "{}")
    .or(
      "options->photoAudit->>state.is.null,options->photoAudit->>state.neq.unavailable",
    )
    .gte(
      "last_seen_at",
      new Date(now - STALE_AFTER_HOURS * 3_600_000).toISOString(),
    )
    .lte("last_seen_at", new Date(now).toISOString());
}

/** Syntax validation only: an accepted URL is not proof that its image still loads. */
export function listingPhotos(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((item): item is string => {
        if (typeof item !== "string" || !item.trim()) return false;
        try {
          const url = new URL(item);
          return (
            ["https:", "http:"].includes(url.protocol) &&
            !/(?:no[-_]?image|placeholder|no[-_]?photo)/i.test(url.pathname)
          );
        } catch {
          return false;
        }
      }),
    ),
  ).slice(0, limit);
}

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
    listingPhotos(row.images).length > 0 &&
    Number.isFinite(seen) &&
    seen <= now &&
    now - seen <= STALE_AFTER_HOURS * 3_600_000
  );
}
