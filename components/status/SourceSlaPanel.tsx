"use client";

/**
 * Source health SLA (operator /status). One row per source: status, last successful pull, rows in
 * the last run, freshness % (live vs frozen), consecutive failures, challenged/blocked counts, and
 * the scraper version (git SHA + image build time). Data comes from /api/system/status (service-role
 * read of source_health_sla); nothing here is in the public status payload.
 */
import React from "react";

const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "–";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${Math.max(0, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const until = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  return m <= 0
    ? "retrying now"
    : m < 60
      ? `retry in ${m}m`
      : `retry in ${Math.round(m / 60)}h`;
};

const STATUS_COLOR: Record<string, string> = {
  healthy: "var(--green)",
  unchanged: "var(--green)",
  degraded: "var(--amber, #d97706)",
  failing: "var(--red)",
  paused: "var(--red)",
};

export function shortSha(sha?: string | null) {
  return sha ? sha.slice(0, 7) : "unknown";
}

export default function SourceSlaPanel({
  sla,
  version,
}: {
  sla: any;
  version: any;
}) {
  if (!sla) return null;
  const rows: any[] = sla.sources || [];
  return (
    <div className="glass-panel p-5" data-testid="source-health-sla">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Source health SLA
        </p>
        <p
          className="text-[10px] text-[var(--t4)]"
          data-testid="scraper-version"
        >
          Scraper {shortSha(version?.gitSha)}
          {version?.imageBuiltAt ? ` · built ${ago(version.imageBuiltAt)}` : ""}
          {version?.seenAt ? ` · last run ${ago(version.seenAt)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-[var(--t2)] mb-3">
        <span>{sla.summary?.sources ?? rows.length} sources</span>
        <span>{sla.summary?.paused ?? 0} paused</span>
        <span>{sla.summary?.failing ?? 0} failing</span>
        <span>{sla.summary?.degraded ?? 0} degraded</span>
        {sla.deadLettersPending != null && (
          <span>{sla.deadLettersPending} dead letters to review</span>
        )}
        {sla.schema === "runs_only" && (
          <span className="text-[var(--t4)]">
            (reliability migration not applied: partial view)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--t4)]">
              <th className="py-1 pr-3">Source</th>
              <th className="py-1 pr-3">Status</th>
              <th className="py-1 pr-3">Last success</th>
              <th className="py-1 pr-3">Rows (last run)</th>
              <th className="py-1 pr-3">Fresh %</th>
              <th className="py-1 pr-3">Fails in a row</th>
              <th className="py-1 pr-3">Challenged / blocked (7d)</th>
              <th className="py-1">Version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--b1)]">
            {rows.map((r) => (
              <tr key={r.source} data-testid={`sla-row-${r.source}`}>
                <td className="py-1.5 pr-3 font-semibold text-[var(--t2)] capitalize">
                  {String(r.source).replace(/_/g, " ")}
                </td>
                <td className="py-1.5 pr-3">
                  <span
                    className="font-bold uppercase text-[10px]"
                    style={{ color: STATUS_COLOR[r.status] || "var(--t4)" }}
                  >
                    {r.status}
                  </span>
                  {r.status === "paused" && (
                    <span className="text-[var(--t4)]">
                      {" "}
                      · {until(r.pausedUntil)}
                    </span>
                  )}
                  {r.lastOutcome &&
                    r.lastOutcome !== "ok" &&
                    r.status !== "paused" && (
                      <span className="text-[var(--t4)]">
                        {" "}
                        · last {r.lastOutcome}
                      </span>
                    )}
                </td>
                <td className="py-1.5 pr-3 text-[var(--t4)]">
                  {ago(r.lastSuccessAt)}
                </td>
                <td className="py-1.5 pr-3 text-[var(--t4)]">
                  {r.lastRunRows ?? "–"}
                </td>
                <td className="py-1.5 pr-3 text-[var(--t4)]">
                  {r.freshnessPct == null
                    ? "–"
                    : `${r.freshnessPct}% (${r.frozenRows ?? 0} frozen)`}
                </td>
                <td className="py-1.5 pr-3 text-[var(--t4)]">
                  {r.consecutiveFailures}/{r.breakerThreshold}
                </td>
                <td className="py-1.5 pr-3 text-[var(--t4)]">
                  {r.challenged7d} / {r.blocked7d}
                </td>
                <td className="py-1.5 text-[var(--t4)] font-mono">
                  {r.gitSha ? shortSha(r.gitSha) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(sla.alerts || []).length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Breaker alerts
          </p>
          {sla.alerts.slice(0, 5).map((a: any, i: number) => (
            <p key={i} className="text-xs text-[var(--t4)]">
              {ago(a.created_at)}: {a.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
