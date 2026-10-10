/**
 * When to crawl. Two rules:
 *  1. Freshness: each source is only refetched as often as its data actually changes.
 *  2. Off-peak: when SCRAPE_OFF_PEAK_ONLY=1, non-urgent refreshes wait for the site's quiet hours
 *     (default 22:00–06:00 US Central, where most of our dealers are).
 */

/** Minimum hours between successful runs per source. Unknown sources default to 6h. */
export const SOURCE_FRESHNESS_HOURS: Record<string, number> = {
  // Government auctions: lots post days ahead and close on a schedule.
  gsa_auctions: 6,
  // Dealer lots turn over in days, not minutes.
  curated_dealers: 4,
  independent_dealer: 12,
  auto_discover: 24,
  // Official API sources (cheap for the site): can run more often.
  ebay_browse: 2,
};

export const DEFAULT_FRESHNESS_HOURS = 6;

export function freshnessHours(sourceId: string): number {
  const fromEnv = Number(
    process.env[`FRESHNESS_HOURS_${sourceId.toUpperCase()}`] || "",
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return SOURCE_FRESHNESS_HOURS[sourceId] ?? DEFAULT_FRESHNESS_HOURS;
}

/** True when the source's last successful run is older than its freshness need (or unknown). */
export function isSourceDue(
  sourceId: string,
  lastOkAt: string | number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (lastOkAt == null) return true;
  const at = typeof lastOkAt === "number" ? lastOkAt : Date.parse(lastOkAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= freshnessHours(sourceId) * 3600_000;
}

function hourIn(timeZone: string, now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Off-peak window [startHour, endHour) in `timeZone`; wraps midnight when start > end. */
export function isOffPeak(
  now: number = Date.now(),
  opts: { timeZone?: string; startHour?: number; endHour?: number } = {},
): boolean {
  const tz = opts.timeZone ?? process.env.OFF_PEAK_TZ ?? "America/Chicago";
  const start = opts.startHour ?? Number(process.env.OFF_PEAK_START_HOUR ?? 22);
  const end = opts.endHour ?? Number(process.env.OFF_PEAK_END_HOUR ?? 6);
  const h = hourIn(tz, now);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

/**
 * Should a sweep run this source right now? Always respects freshness. With SCRAPE_OFF_PEAK_ONLY=1,
 * a source that already has data (lastOkAt set) also waits for off-peak hours; a source with no
 * data yet may run any time so new coverage isn't held back.
 */
export function shouldCrawlNow(
  sourceId: string,
  lastOkAt: string | number | null | undefined,
  now: number = Date.now(),
  offPeakOnly: boolean = process.env.SCRAPE_OFF_PEAK_ONLY === "1",
): boolean {
  if (!isSourceDue(sourceId, lastOkAt, now)) return false;
  if (!offPeakOnly || lastOkAt == null) return true;
  return isOffPeak(now);
}
