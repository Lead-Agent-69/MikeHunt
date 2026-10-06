/**
 * "New to MikeHunt" rail. We only know when MikeHunt first saw a listing (first_seen_at), not when
 * the seller posted it, so the rail is bounded on that and labeled that way.
 *
 * JUST_LISTED_WINDOW_HOURS: a row first seen more than this long ago is not "new". Rows with no
 * first-seen time, an unparseable one, or one in the future are left out: their age is unknown.
 */
export const JUST_LISTED_WINDOW_HOURS = 72;
const HOUR_MS = 3_600_000;
/** Clock skew between scraper and server before a first-seen time counts as "future". */
const FUTURE_SKEW_MS = HOUR_MS;

type FirstSeen = { firstSeenAt?: string | Date | null };

function firstSeenMs(row: FirstSeen): number | null {
  const raw = row?.firstSeenAt;
  if (!raw) return null;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

/** Is this row first seen inside the window? */
export function isJustListed(row: FirstSeen, now: number = Date.now()) {
  const t = firstSeenMs(row);
  if (t == null) return false;
  if (t > now + FUTURE_SKEW_MS) return false;
  return now - t <= JUST_LISTED_WINDOW_HOURS * HOUR_MS;
}

/** Rows first seen inside the window, newest first, capped at `limit`. Never mutates the input. */
export function justListedRail<T extends FirstSeen>(
  rows: readonly T[],
  now: number = Date.now(),
  limit = 20,
): T[] {
  return rows
    .filter((row) => isJustListed(row, now))
    .sort((a, b) => (firstSeenMs(b) ?? 0) - (firstSeenMs(a) ?? 0))
    .slice(0, limit);
}
