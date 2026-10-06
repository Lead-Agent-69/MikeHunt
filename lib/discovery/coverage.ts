/**
 * Discover coverage honesty. Counts the listings actually seen in the buyer's states in the last
 * N days, by source, so the UI can say "coverage is thin here" instead of implying a full market.
 * Every number comes from rows the discover_deals RPC returned. Nothing is estimated.
 */

export const COVERAGE_WINDOW_DAYS = 7;
/** Below either floor the block reports status "thin". Exposed in the payload so UI copy can cite it. */
export const COVERAGE_THIN_MIN_ROWS = 50;
export const COVERAGE_THIN_MIN_SOURCES = 2;

export type CoverageRow = {
  source?: string | null;
  location_state?: string | null;
  last_seen_at?: string | null;
};

export type DiscoverCoverage = {
  status: "none" | "thin" | "ok" | "unavailable";
  windowDays: number;
  since: string | null;
  /** States the counts cover. Empty means the request was nationwide. */
  states: string[];
  /** Price cap applied by the same query (0 = none). */
  maxPrice: number;
  /** Active listings seen in the window, before Discover's lane/seller/title filters. */
  freshRows: number;
  /** The subset of freshRows that passed this request's Discover filters. */
  freshRowsInFeed: number;
  sourceCount: number;
  bySource: Array<{
    source: string;
    rows: number;
    newestSeenAt: string | null;
  }>;
  /** Only the requested states, each with its fresh row count (0 when nothing was seen). */
  byState: Array<{ state: string; rows: number }>;
  newestSeenAt: string | null;
  /** True when the RPC row cap was reached inside the window, so counts are a floor. */
  capped: boolean;
  thresholds: { minRows: number; minSources: number };
  reason?: string;
};

function seenMs(row: CoverageRow): number {
  const t = row.last_seen_at ? Date.parse(row.last_seen_at) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

export function unavailableCoverage(reason: string): DiscoverCoverage {
  return {
    status: "unavailable",
    windowDays: COVERAGE_WINDOW_DAYS,
    since: null,
    states: [],
    maxPrice: 0,
    freshRows: 0,
    freshRowsInFeed: 0,
    sourceCount: 0,
    bySource: [],
    byState: [],
    newestSeenAt: null,
    capped: false,
    thresholds: {
      minRows: COVERAGE_THIN_MIN_ROWS,
      minSources: COVERAGE_THIN_MIN_SOURCES,
    },
    reason,
  };
}

export function buildDiscoverCoverage(input: {
  /** Rows the state-scoped RPC returned (active, ask > 0, newest first). */
  marketRows: readonly CoverageRow[];
  /** Rows that passed Discover's filters for this request. */
  feedRows: readonly CoverageRow[];
  states: readonly string[];
  maxPrice?: number;
  /** The RPC LIMIT used for marketRows. */
  rowCap: number;
  now?: Date;
  windowDays?: number;
}): DiscoverCoverage {
  const windowDays = input.windowDays ?? COVERAGE_WINDOW_DAYS;
  const nowMs = (input.now ?? new Date()).getTime();
  const sinceMs = nowMs - windowDays * 86_400_000;
  const states = Array.from(
    new Set(
      input.states
        .map((s) =>
          String(s || "")
            .trim()
            .toUpperCase(),
        )
        .filter((s) => /^[A-Z]{2}$/.test(s)),
    ),
  );
  const inWindow = (row: CoverageRow) => {
    const t = seenMs(row);
    return Number.isFinite(t) && t >= sinceMs && t <= nowMs + 86_400_000;
  };

  const fresh = input.marketRows.filter(inWindow);
  const bySourceMap = new Map<string, { rows: number; newest: number }>();
  const byStateMap = new Map<string, number>(states.map((s) => [s, 0]));
  let newest = NaN;
  for (const row of fresh) {
    const source = String(row.source || "unknown").toLowerCase();
    const t = seenMs(row);
    const entry = bySourceMap.get(source) || { rows: 0, newest: NaN };
    entry.rows += 1;
    if (!Number.isFinite(entry.newest) || t > entry.newest) entry.newest = t;
    bySourceMap.set(source, entry);
    if (!Number.isFinite(newest) || t > newest) newest = t;
    const st = String(row.location_state || "").toUpperCase();
    if (byStateMap.has(st)) byStateMap.set(st, (byStateMap.get(st) || 0) + 1);
  }

  const bySource = Array.from(bySourceMap.entries())
    .map(([source, v]) => ({
      source,
      rows: v.rows,
      newestSeenAt: Number.isFinite(v.newest)
        ? new Date(v.newest).toISOString()
        : null,
    }))
    .sort((a, b) => b.rows - a.rows || a.source.localeCompare(b.source));

  // The RPC orders newest first. If it hit its cap and even the oldest returned row is still inside
  // the window, rows beyond the cap may also be fresh, so the counts are a floor.
  const oldest = input.marketRows.length
    ? seenMs(input.marketRows[input.marketRows.length - 1])
    : NaN;
  const capped =
    input.marketRows.length >= input.rowCap &&
    Number.isFinite(oldest) &&
    oldest >= sinceMs;

  const freshRows = fresh.length;
  const sourceCount = bySource.length;
  const status: DiscoverCoverage["status"] =
    freshRows === 0
      ? "none"
      : (!capped && freshRows < COVERAGE_THIN_MIN_ROWS) ||
          sourceCount < COVERAGE_THIN_MIN_SOURCES
        ? "thin"
        : "ok";

  return {
    status,
    windowDays,
    since: new Date(sinceMs).toISOString(),
    states,
    maxPrice: Math.max(0, Number(input.maxPrice) || 0),
    freshRows,
    freshRowsInFeed: input.feedRows.filter(inWindow).length,
    sourceCount,
    bySource,
    byState: states.map((state) => ({
      state,
      rows: byStateMap.get(state) || 0,
    })),
    newestSeenAt: Number.isFinite(newest)
      ? new Date(newest).toISOString()
      : null,
    capped,
    thresholds: {
      minRows: COVERAGE_THIN_MIN_ROWS,
      minSources: COVERAGE_THIN_MIN_SOURCES,
    },
  };
}
