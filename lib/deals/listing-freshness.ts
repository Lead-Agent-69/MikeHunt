/**
 * Truthful listing freshness.
 *
 * `deals.last_seen_at` is advanced every time a scraper RE-OBSERVES a listing (pipeline upsert and
 * the local-cache "touch" for unchanged rows), so on a week-old listing it reads "just now" after
 * every cycle. That is when we last checked it, not how new it is. `first_seen_at` is set once on
 * insert and never rewritten, so it carries the listing's age.
 *
 * Cards used to render `Seen just now` from last_seen_at alone, which told buyers an old listing
 * was brand new. This label leads with age (first seen) and only adds the re-check time when it
 * differs.
 */

export type ListingSeenInput = {
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
};

const HOUR = 3_600_000;

function toMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  const ms =
    value instanceof Date ? value.getTime() : new Date(value as any).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ago(ms: number, now: number): string {
  const hours = Math.max(0, Math.round((now - ms) / HOUR));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * "First seen 7d ago · checked just now" for an old listing we re-observed,
 * "First seen 2h ago" for a new one, "Checked 3h ago" when only last_seen is known.
 */
export function listingFreshnessLabel(
  input: ListingSeenInput,
  now: number = Date.now(),
): string {
  const first = toMs(input.firstSeenAt);
  const last = toMs(input.lastSeenAt);
  if (first == null && last == null) return "Freshness unknown";
  if (first == null) return `Checked ${ago(last as number, now)}`;
  const listed = `First seen ${ago(first, now)}`;
  // Re-observed at least an hour after first sight → say when we last checked, separately.
  if (last != null && last - first >= HOUR) {
    return `${listed} · checked ${ago(last, now)}`;
  }
  return listed;
}

/**
 * Never fabricate a timestamp. API mappers used to fall back to `new Date()` when a row had no
 * first/last seen value, which painted "Seen just now" on rows we had no time for at all.
 */
export function seenTimestampOrNull(value: unknown): string | null {
  const ms = toMs(value);
  return ms == null ? null : new Date(ms).toISOString();
}
