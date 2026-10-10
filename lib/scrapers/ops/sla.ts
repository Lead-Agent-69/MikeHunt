/**
 * Source health SLA for /status: one row per source with status, last successful pull, rows in the
 * last run, freshness % (live vs frozen), consecutive failures, challenged/blocked counts, breaker
 * pause and the code version that ran it. Server-only: called from /api/system/status with the
 * service-role client (source_health_sla and the scraper_* tables have no anon/authenticated grants).
 * Before migration 20261010200000 is applied it degrades to what scraper_runs alone can tell.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchemaError } from "./run-log";
import { loadRunStates, pauseStateOf, breakerPolicy } from "./source-breaker";

export type SlaStatus =
  | "healthy"
  | "unchanged"
  | "degraded"
  | "failing"
  | "paused";

export interface SourceSlaRow {
  source: string;
  status: SlaStatus;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastRunRows: number | null;
  lastOutcome: string | null;
  freshnessPct: number | null;
  activeRows: number | null;
  liveRows: number | null;
  frozenRows: number | null;
  consecutiveFailures: number;
  breakerThreshold: number;
  pausedUntil: string | null;
  challenged7d: number;
  blocked7d: number;
  runs7d: number;
  healthyRuns7d: number;
  scanMode: string | null;
  gitSha: string | null;
  imageBuiltAt: string | null;
}

export function slaStatus(
  r: Pick<SourceSlaRow, "consecutiveFailures" | "pausedUntil" | "lastOutcome">,
  threshold: number,
  now: number = Date.now(),
): SlaStatus {
  if (r.pausedUntil && Date.parse(r.pausedUntil) > now) return "paused";
  if (r.consecutiveFailures >= threshold) return "failing";
  if (r.consecutiveFailures > 0) return "degraded";
  if (r.lastOutcome === "unchanged") return "unchanged";
  return "healthy";
}

const n = (v: unknown) => (v == null ? null : Number(v));

export function mapSlaRow(
  row: Record<string, any>,
  now: number = Date.now(),
): SourceSlaRow {
  const consecutiveFailures = Number(row.consecutive_failures || 0);
  const policy = breakerPolicy(String(row.source));
  const pause = pauseStateOf(
    {
      source: row.source,
      consecutiveFailures,
      lastRunAt: row.last_run_at ?? null,
    },
    now,
    policy,
  );
  const active = n(row.active_rows);
  const live = n(row.live_rows);
  const base = {
    source: String(row.source),
    lastRunAt: row.last_run_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    lastRunRows: n(row.last_run_rows),
    lastOutcome: row.last_outcome ?? null,
    freshnessPct: n(row.freshness_pct),
    activeRows: active,
    liveRows: live,
    frozenRows: active != null && live != null ? active - live : null,
    consecutiveFailures,
    breakerThreshold: policy.threshold,
    pausedUntil: pause.paused ? pause.pausedUntil : null,
    challenged7d: Number(row.challenged_7d || 0),
    blocked7d: Number(row.blocked_7d || 0),
    runs7d: Number(row.runs_7d || 0),
    healthyRuns7d: Number(row.healthy_runs_7d || 0),
    scanMode: row.last_scan_mode ?? null,
    gitSha: row.last_git_sha ?? null,
    imageBuiltAt: row.last_image_built_at ?? null,
  };
  return { ...base, status: slaStatus(base, policy.threshold, now) };
}

const ORDER: Record<SlaStatus, number> = {
  paused: 0,
  failing: 1,
  degraded: 2,
  unchanged: 3,
  healthy: 4,
};

export async function loadSourceSla(
  sb: Pick<SupabaseClient, "from">,
  now: number = Date.now(),
) {
  let rows: SourceSlaRow[] = [];
  let schema: "sla_view" | "runs_only" = "sla_view";
  const view = await sb.from("source_health_sla").select("*").limit(500);
  if (!view.error) {
    rows = (view.data ?? []).map((r: any) => mapSlaRow(r, now));
  } else if (isMissingSchemaError(view.error)) {
    schema = "runs_only";
    const states = await loadRunStates(sb);
    rows = Array.from(states.values()).map((st) =>
      mapSlaRow(
        {
          source: st.source,
          last_run_at: st.lastRunAt,
          last_success_at: st.lastSuccessAt,
          consecutive_failures: st.consecutiveFailures,
        },
        now,
      ),
    );
  } else {
    throw new Error(view.error.message);
  }
  rows.sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] || a.source.localeCompare(b.source),
  );

  const [alerts, dead, latest] = await Promise.all([
    sb
      .from("scraper_alerts")
      .select(
        "source, kind, consecutive_failures, paused_until, message, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("scraper_dead_letters")
      .select("id", { count: "exact", head: true })
      .is("replayed_at", null),
    sb
      .from("scraper_runs")
      .select("git_sha, image_built_at, started_at")
      .not("git_sha", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    schema,
    sources: rows,
    summary: {
      sources: rows.length,
      paused: rows.filter((r) => r.status === "paused").length,
      failing: rows.filter((r) => r.status === "failing").length,
      degraded: rows.filter((r) => r.status === "degraded").length,
    },
    alerts: alerts.error ? [] : (alerts.data ?? []),
    deadLettersPending: dead.error ? null : (dead.count ?? 0),
    version:
      latest.error || !latest.data
        ? null
        : {
            gitSha: latest.data.git_sha as string,
            imageBuiltAt: (latest.data.image_built_at as string) ?? null,
            seenAt: latest.data.started_at as string,
          },
  };
}

export type SourceSlaReport = Awaited<ReturnType<typeof loadSourceSla>>;
