/**
 * Source-level circuit breaker, persisted through scraper_runs (each sweep is a fresh process, so
 * in-memory state can't carry across runs).
 *
 *  - N consecutive failed runs (default 5) pause the source.
 *  - The pause is temporary: it lasts cooldown(n) after the last run, starting at
 *    SCRAPER_BREAKER_COOLDOWN_MIN (60) and doubling for every further failure, capped at
 *    SCRAPER_BREAKER_MAX_COOLDOWN_HOURS (24). When it ends the source is retried automatically
 *    (half-open); one healthy run closes the breaker.
 *  - Each pause (and each recovery) writes a scraper_alerts row, plus a Sentry message when SENTRY_DSN
 *    is set. Nothing here touches the registry, scraper_state.enabled or the sweep list: a paused
 *    source is still registered and scheduled, it just sits out until its cooldown ends.
 *
 * "Failed" = outcome empty/blocked/challenged/failed. `unchanged` (all pages 304 / same hash in an
 * incremental run) is healthy. Rows written before migration 20261010200000 have no outcome and use
 * source_health's rule: success with rows found.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_SOURCES, type SourcePoliteTuning } from "../sources-registry";
import { normalizeExemptId } from "../polite/robots-exempt";
import { HEALTHY_OUTCOMES } from "./run-telemetry";
import { isMissingSchemaError } from "./run-log";

export interface BreakerPolicy {
  threshold: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
}

export interface RunStateRow {
  source: string;
  status: string;
  outcome?: string | null;
  deals_found?: number | null;
  started_at: string;
  scan_mode?: string | null;
}

export interface SourceRunState {
  source: string;
  consecutiveFailures: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFullScanAt: string | null;
}

export interface PauseState {
  paused: boolean;
  pausedUntil: string | null;
  consecutiveFailures: number;
  cooldownMs: number;
}

const envNum = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const tuningById = new Map<string, SourcePoliteTuning>();
for (const s of ALL_SOURCES) {
  if (!s.polite) continue;
  for (const id of [s.id, ...(s.exemptRunnerIds ?? [])])
    tuningById.set(normalizeExemptId(id), {
      ...tuningById.get(normalizeExemptId(id)),
      ...s.polite,
    });
}

/** Registry polite tuning for a runner/source id (normalized: ebay_sold == ebay-sold). */
export function sourceTuning(sourceId: string): SourcePoliteTuning {
  return tuningById.get(normalizeExemptId(sourceId)) ?? {};
}

export function breakerPolicy(
  sourceId: string,
  env: Record<string, string | undefined> = process.env,
  tuning: SourcePoliteTuning = sourceTuning(sourceId),
): BreakerPolicy {
  const threshold = Math.max(
    1,
    Math.floor(
      tuning.breakerThreshold ?? envNum(env.SCRAPER_BREAKER_THRESHOLD, 5),
    ),
  );
  const baseMin =
    tuning.breakerCooldownMin ?? envNum(env.SCRAPER_BREAKER_COOLDOWN_MIN, 60);
  const maxH = envNum(env.SCRAPER_BREAKER_MAX_COOLDOWN_HOURS, 24);
  return {
    threshold,
    baseCooldownMs: Math.max(1, baseMin) * 60_000,
    maxCooldownMs: Math.max(baseMin / 60, maxH) * 3_600_000,
  };
}

/** Exponential backoff: base at the threshold, doubling for each further failure, capped. */
export function cooldownMs(
  consecutiveFailures: number,
  p: BreakerPolicy,
): number {
  if (consecutiveFailures < p.threshold) return 0;
  const exp = Math.min(30, consecutiveFailures - p.threshold);
  return Math.min(p.maxCooldownMs, p.baseCooldownMs * 2 ** exp);
}

export function isHealthyRun(
  r: Pick<RunStateRow, "status" | "outcome" | "deals_found">,
): boolean {
  if (r.outcome) return HEALTHY_OUTCOMES.has(r.outcome);
  return r.status === "success" && Number(r.deals_found || 0) > 0;
}

/** Fold run rows (any order) into per-source state. In-flight ('running') rows are ignored. */
export function summarizeRunStates(
  rows: RunStateRow[],
): Map<string, SourceRunState> {
  const bySource = new Map<string, RunStateRow[]>();
  for (const r of rows || []) {
    if (!r?.source || r.status === "running") continue;
    const list = bySource.get(r.source) ?? [];
    list.push(r);
    bySource.set(r.source, list);
  }
  const out = new Map<string, SourceRunState>();
  for (const [source, list] of Array.from(bySource.entries())) {
    list.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    let n = 0;
    while (n < list.length && !isHealthyRun(list[n])) n++;
    const lastOk = list.find(isHealthyRun);
    const lastFull = list.find(
      (r) => isHealthyRun(r) && r.scan_mode === "full",
    );
    out.set(source, {
      source,
      consecutiveFailures: n,
      lastRunAt: list[0]?.started_at ?? null,
      lastSuccessAt: lastOk?.started_at ?? null,
      lastFullScanAt: lastFull?.started_at ?? null,
    });
  }
  return out;
}

export function pauseStateOf(
  state:
    | Pick<SourceRunState, "source" | "consecutiveFailures" | "lastRunAt">
    | undefined,
  now: number = Date.now(),
  policy?: BreakerPolicy,
): PauseState {
  const n = state?.consecutiveFailures ?? 0;
  const p = policy ?? breakerPolicy(state?.source ?? "");
  const cd = cooldownMs(n, p);
  const last = state?.lastRunAt ? Date.parse(state.lastRunAt) : NaN;
  if (!cd || !Number.isFinite(last))
    return {
      paused: false,
      pausedUntil: null,
      consecutiveFailures: n,
      cooldownMs: cd,
    };
  const until = last + cd;
  return {
    paused: until > now,
    pausedUntil: new Date(until).toISOString(),
    consecutiveFailures: n,
    cooldownMs: cd,
  };
}

/** Last 7 days of run rows (service role). Falls back to the pre-migration columns. */
export async function loadRunStates(
  sb: Pick<SupabaseClient, "from">,
  sources?: string[],
): Promise<Map<string, SourceRunState>> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const query = (cols: string) => {
    let q: any = sb.from("scraper_runs").select(cols).gt("started_at", since);
    if (sources?.length) q = q.in("source", sources);
    return q.order("started_at", { ascending: false }).limit(5000);
  };
  let res = await query(
    "source, status, outcome, deals_found, started_at, scan_mode",
  );
  if (res.error && isMissingSchemaError(res.error))
    res = await query("source, status, deals_found, started_at");
  if (res.error) throw new Error(res.error.message);
  return summarizeRunStates((res.data ?? []) as RunStateRow[]);
}

/**
 * Sources to sit out this run. Fail-open: any error returns an empty map so a database hiccup can
 * never stop the sweep.
 */
export async function getPausedSources(
  sb: Pick<SupabaseClient, "from"> | null,
  now: number = Date.now(),
): Promise<Map<string, PauseState>> {
  const out = new Map<string, PauseState>();
  if (!sb) return out;
  try {
    const states = await loadRunStates(sb);
    for (const [source, st] of Array.from(states.entries())) {
      const p = pauseStateOf(st, now);
      if (p.paused) out.set(source, p);
    }
  } catch (e) {
    console.warn(
      `[breaker] could not read run states (not pausing anything): ${(e as Error).message}`,
    );
  }
  return out;
}

export interface BreakerAlert {
  source: string;
  kind: "circuit_open" | "circuit_closed";
  consecutive_failures: number;
  paused_until: string | null;
  message: string;
}

/**
 * Compare a source's state before and after this sweep. A failure at or past the threshold opens
 * (or re-opens with a longer cooldown) the breaker; a healthy run after an open breaker closes it.
 */
export function breakerTransitions(
  before: Map<string, SourceRunState>,
  after: Map<string, SourceRunState>,
  ranSources: string[],
  now: number = Date.now(),
): BreakerAlert[] {
  const alerts: BreakerAlert[] = [];
  for (const source of ranSources) {
    const a = after.get(source);
    if (!a) continue;
    const b = before.get(source);
    const p = breakerPolicy(source);
    const prevN = b?.consecutiveFailures ?? 0;
    if (a.consecutiveFailures >= p.threshold && a.consecutiveFailures > prevN) {
      const ps = pauseStateOf(a, now, p);
      alerts.push({
        source,
        kind: "circuit_open",
        consecutive_failures: a.consecutiveFailures,
        paused_until: ps.pausedUntil,
        message: `${source}: ${a.consecutiveFailures} failed runs in a row; paused ${Math.round(ps.cooldownMs / 60_000)} min (until ${ps.pausedUntil}), then retried automatically. Not removed or disabled.`,
      });
    } else if (prevN >= p.threshold && a.consecutiveFailures === 0) {
      alerts.push({
        source,
        kind: "circuit_closed",
        consecutive_failures: 0,
        paused_until: null,
        message: `${source}: healthy again after ${prevN} failed runs; breaker closed.`,
      });
    }
  }
  return alerts;
}

/** Write alert rows (and a Sentry message when SENTRY_DSN is set). Never throws. */
export async function recordBreakerAlerts(
  sb: Pick<SupabaseClient, "from"> | null,
  alerts: BreakerAlert[],
): Promise<number> {
  if (!alerts.length) return 0;
  for (const a of alerts) console.warn(`[breaker] ${a.kind}: ${a.message}`);
  let written = 0;
  if (sb) {
    try {
      const { error } = await sb.from("scraper_alerts").insert(alerts);
      if (!error) written = alerts.length;
    } catch {
      // alerts are best-effort
    }
  }
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/nextjs");
      if (!Sentry.getClient())
        Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
      for (const a of alerts)
        Sentry.captureMessage(`scraper ${a.kind}: ${a.source}`, {
          level: a.kind === "circuit_open" ? "warning" : "info",
          tags: { scraper_source: a.source, breaker: a.kind },
          extra: { ...a },
        });
      await Sentry.flush(2000);
    } catch {
      // Sentry optional
    }
  }
  return written;
}
