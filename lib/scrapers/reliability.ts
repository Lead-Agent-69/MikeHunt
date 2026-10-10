/**
 * Scraper success rate, measured honestly from scraper_runs.
 *
 *  productive  = finished "success" AND found > 0 rows. This is the number that matters.
 *  empty       = finished "success" with 0 rows (a silent failure: parser miss, wall, dead site).
 *  failed      = finished "error".
 *  abandoned   = still "running" long after any run could last (the worker died). Counted as failed.
 *  inFlight    = "running" and recent: excluded from the rate.
 *
 *  unchanged   = an incremental run whose pages were all 304 / same content (healthy, no new rows).
 *  blocked / challenged runs count as failed (403/429/robots/breaker, or a bot-challenge page).
 *
 * Runs written after migration 20261010200000 carry `outcome`, captured before the processor from
 * the run's own failure log, so a scraper that swallowed its HTTP errors and returned 0 now reads
 * as failed (with the reason), not as an empty success.
 *
 * successRatePct = (productive + unchanged) / (productive + unchanged + empty + failed + abandoned).
 */
export interface RunRow {
  source: string;
  status: string;
  deals_found?: number | null;
  started_at: string;
  completed_at?: string | null;
  outcome?: string | null;
}

export interface SourceReliability {
  source: string;
  runs: number;
  productive: number;
  unchanged: number;
  empty: number;
  failed: number;
  abandoned: number;
  inFlight: number;
  successRatePct: number | null;
  lastProductiveAt: string | null;
}

/** A run older than this that never finished is treated as abandoned. Longest healthy sweep ≈ 16m. */
export const ABANDONED_AFTER_MS = 2 * 60 * 60_000;

export function classifyRun(
  row: RunRow,
  now: number = Date.now(),
): "productive" | "unchanged" | "empty" | "failed" | "abandoned" | "inFlight" {
  if (row.status === "running" && !row.completed_at) {
    const started = Date.parse(row.started_at);
    return Number.isFinite(started) && now - started > ABANDONED_AFTER_MS
      ? "abandoned"
      : "inFlight";
  }
  if (row.outcome) {
    if (row.outcome === "ok") return "productive";
    if (row.outcome === "unchanged") return "unchanged";
    if (row.outcome === "empty") return "empty";
    return "failed";
  }
  if (row.status === "success")
    return Number(row.deals_found || 0) > 0 ? "productive" : "empty";
  return "failed";
}

const rate = (ok: number, total: number) =>
  total > 0 ? Math.round((ok / total) * 1000) / 10 : null;

export function summarizeReliability(rows: RunRow[], now: number = Date.now()) {
  const bySource = new Map<string, SourceReliability>();
  for (const row of rows || []) {
    const source = String(row.source || "unknown");
    const s =
      bySource.get(source) ||
      ({
        source,
        runs: 0,
        productive: 0,
        unchanged: 0,
        empty: 0,
        failed: 0,
        abandoned: 0,
        inFlight: 0,
        successRatePct: null,
        lastProductiveAt: null,
      } as SourceReliability);
    const kind = classifyRun(row, now);
    s.runs += 1;
    s[kind] += 1;
    if (
      kind === "productive" &&
      (!s.lastProductiveAt || row.started_at > s.lastProductiveAt)
    )
      s.lastProductiveAt = row.started_at;
    bySource.set(source, s);
  }
  const sources = Array.from(bySource.values()).map((s) => ({
    ...s,
    successRatePct: rate(s.productive + s.unchanged, s.runs - s.inFlight),
  }));
  const t = sources.reduce(
    (acc, s) => {
      acc.runs += s.runs - s.inFlight;
      acc.productive += s.productive;
      acc.unchanged += s.unchanged;
      acc.empty += s.empty;
      acc.failed += s.failed;
      acc.abandoned += s.abandoned;
      return acc;
    },
    { runs: 0, productive: 0, unchanged: 0, empty: 0, failed: 0, abandoned: 0 },
  );
  return {
    successRatePct: rate(t.productive + t.unchanged, t.runs),
    finishedRuns: t.runs,
    productive: t.productive,
    unchanged: t.unchanged,
    empty: t.empty,
    failed: t.failed,
    abandoned: t.abandoned,
    sources: sources.sort(
      (a, b) => (a.successRatePct ?? 101) - (b.successRatePct ?? 101),
    ),
  };
}

export type ReliabilitySummary = ReturnType<typeof summarizeReliability>;
