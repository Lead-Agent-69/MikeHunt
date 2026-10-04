"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  ImageIcon,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

type AdminStats = {
  totalDeals: number;
  activeDeals: number;
  totalUsers: number;
  recentSignups: number;
  outcomeCount: number;
  goDealsCount: number;
  topDeals: Array<{
    id: string;
    year: number;
    make: string;
    model: string;
    true_net_profit: number;
    deal_verdict: string;
  }>;
};

type SourceHealth = {
  enabled: number;
  due: number;
  healthy: number;
  sources: Array<{
    id: string;
    name: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastStatus: string;
    successRate: number;
    failedRuns: number;
  }>;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load operations data.");
  return response.json();
};

function relativeTime(value: string | null) {
  if (!value) return "No verified run";
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function sourceState(source: SourceHealth["sources"][number]) {
  if (!source.enabled)
    return { label: "Paused", tone: "text-[var(--t4)] bg-[var(--s2)]" };
  if (source.lastStatus === "error")
    return { label: "Attention", tone: "text-[var(--red)] bg-[var(--rlo)]" };
  if (!source.lastRunAt)
    return {
      label: "Awaiting run",
      tone: "text-[var(--amber)] bg-[var(--alo)]",
    };
  if (source.successRate >= 80)
    return {
      label: "Healthy",
      tone: "text-[var(--green)] bg-[var(--glo)]",
    };
  return {
    label: "Needs review",
    tone: "text-[var(--amber)] bg-[var(--alo)]",
  };
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Database;
}) {
  return (
    <div className="rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-4">
      <div className="flex items-center justify-between text-[var(--t4)]">
        <span className="text-xs font-medium">{label}</span>
        <Icon size={16} aria-hidden="true" />
      </div>
      <Mono className="mt-3 block text-2xl font-bold text-[var(--t1)]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </Mono>
      <p className="mt-1 text-xs text-[var(--t4)]">{hint}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
    mutate: refreshStats,
  } = useSWR<AdminStats>("/api/admin/stats", fetcher, {
    refreshInterval: 60000,
  });
  const {
    data: health,
    error: healthError,
    isLoading: healthLoading,
    mutate: refreshHealth,
  } = useSWR<SourceHealth>("/api/scrape/health", fetcher, {
    refreshInterval: 60000,
  });
  const [activeOperation, setActiveOperation] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([refreshStats(), refreshHealth()]);
    toast.success("Operations data refreshed");
  }, [refreshHealth, refreshStats]);

  const runOperation = useCallback(
    async (
      id: string,
      endpoint: string,
      body: Record<string, unknown> = {},
    ) => {
      setActiveOperation(id);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        const count =
          result.updated ??
          result.cachedDeals ??
          result.rescored ??
          result.scanned ??
          0;
        toast.success(`${id} finished`, {
          description: count
            ? `${count.toLocaleString()} records processed.`
            : "There was nothing waiting.",
        });
        await Promise.all([refreshStats(), refreshHealth()]);
      } catch {
        toast.error(`${id} could not finish`, {
          description:
            "No changes were confirmed. Check the operational logs and try again.",
        });
      } finally {
        setActiveOperation(null);
      }
    },
    [refreshHealth, refreshStats],
  );

  const attentionSources = useMemo(
    () =>
      (health?.sources ?? [])
        .filter(
          (source) =>
            source.lastStatus === "error" ||
            (!source.lastRunAt && source.enabled) ||
            (source.successRate > 0 && source.successRate < 80),
        )
        .slice(0, 6),
    [health],
  );
  const loading = statsLoading || healthLoading;
  const unavailable = statsError || healthError;

  return (
    <section className="mx-auto max-w-7xl space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-[var(--b1)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--blue)]">
            <ShieldCheck size={15} /> Operations
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--t1)]">
            MIKEHUNT control room
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--t3)]">
            Live inventory quality, source reliability, and bounded maintenance
            controls. Buyer-facing data remains separate from this workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--b2)] px-4 text-sm font-semibold text-[var(--t2)] transition-colors hover:bg-[var(--s2)] disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh status
        </button>
      </header>

      {unavailable && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--rlo)] bg-[var(--rlo)] px-4 py-3 text-sm text-[var(--t2)]"
        >
          Operations data is temporarily unavailable. No maintenance task has
          been started.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Active inventory"
          value={stats?.activeDeals ?? "--"}
          hint={`${stats?.totalDeals?.toLocaleString() ?? "--"} total records`}
          icon={Database}
        />
        <Metric
          label="Source health"
          value={health ? `${health.healthy}/${health.enabled}` : "--"}
          hint={
            health?.due
              ? `${health.due} source${health.due === 1 ? "" : "s"} due`
              : "No queued source runs"
          }
          icon={Activity}
        />
        <Metric
          label="Accounts"
          value={stats?.totalUsers ?? "--"}
          hint={`${stats?.recentSignups ?? 0} new in seven days`}
          icon={Users}
        />
        <Metric
          label="Decision feedback"
          value={stats?.outcomeCount ?? "--"}
          hint={`${stats?.goDealsCount ?? 0} current buy candidates`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-[var(--b1)] bg-[var(--s1)]">
          <div className="flex items-center justify-between border-b border-[var(--b1)] px-5 py-4">
            <div>
              <h2 className="font-semibold text-[var(--t1)]">Source watch</h2>
              <p className="mt-1 text-xs text-[var(--t4)]">
                Only verified run history is shown here.
              </p>
            </div>
            <a
              href="/orchestrator"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--blue)] hover:underline"
            >
              Open operations <ArrowRight size={15} />
            </a>
          </div>
          <div className="divide-y divide-[var(--b1)]">
            {loading && (
              <div className="p-5 text-sm text-[var(--t4)]">
                Loading source status...
              </div>
            )}
            {!loading && attentionSources.length === 0 && (
              <div className="flex items-center gap-3 p-5 text-sm text-[var(--t3)]">
                <CheckCircle2 className="text-[var(--green)]" size={18} />
                No sources need an immediate review.
              </div>
            )}
            {attentionSources.map((source) => {
              const state = sourceState(source);
              return (
                <div
                  key={source.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-[170px] flex-1">
                    <p className="text-sm font-semibold text-[var(--t1)]">
                      {source.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--t4)]">
                      Last verified {relativeTime(source.lastRunAt)} ·{" "}
                      {source.failedRuns} failed run
                      {source.failedRuns === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.tone}`}
                  >
                    {state.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-5">
          <div className="flex items-center gap-2">
            <Workflow size={17} className="text-[var(--blue)]" />
            <h2 className="font-semibold text-[var(--t1)]">
              Maintenance queue
            </h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--t4)]">
            Each task is bounded, uses your authenticated owner session, and
            refreshes the workspace when it completes.
          </p>
          <div className="mt-5 space-y-3">
            {[
              {
                id: "Recalculate decisions",
                detail:
                  "Refresh pricing, costs, ceilings, and verdicts for active inventory.",
                icon: Sparkles,
                endpoint: "/api/admin/rescore",
                body: { page: 0, pageSize: 500 },
              },
              {
                id: "Normalize vehicles",
                detail:
                  "Correct make and model data using available VIN evidence.",
                icon: Wrench,
                endpoint: "/api/admin/canonicalize",
                body: { maxDecode: 40 },
              },
              {
                id: "Cache listing photos",
                detail:
                  "Preserve source photos for high-confidence buy candidates.",
                icon: ImageIcon,
                endpoint: "/api/admin/cache-photos",
                body: { limit: 25, goOnly: true },
              },
              {
                id: "Improve map coverage",
                detail:
                  "Resolve unplaced active inventory by distinct location.",
                icon: MapPinned,
                endpoint: "/api/admin/geocode-backfill",
                body: { maxLookups: 30 },
              },
            ].map((operation) => {
              const Icon = operation.icon;
              const running = activeOperation === operation.id;
              return (
                <div
                  key={operation.id}
                  className="rounded-md border border-[var(--b1)] p-3"
                >
                  <div className="flex gap-3">
                    <Icon
                      size={16}
                      className="mt-0.5 shrink-0 text-[var(--blue)]"
                    />
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--t1)]">
                        {operation.id}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--t4)]">
                        {operation.detail}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(activeOperation)}
                    onClick={() =>
                      runOperation(
                        operation.id,
                        operation.endpoint,
                        operation.body,
                      )
                    }
                    className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border border-[var(--b2)] text-xs font-semibold text-[var(--t2)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {running ? "Working..." : "Run task"}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      <div className="rounded-lg border border-[var(--b1)] bg-[var(--s1)]">
        <div className="flex items-center justify-between border-b border-[var(--b1)] px-5 py-4">
          <div>
            <h2 className="font-semibold text-[var(--t1)]">
              High-confidence buys
            </h2>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Live rows ranked by the current decision model.
            </p>
          </div>
          <a
            href="/scan"
            className="text-sm font-semibold text-[var(--blue)] hover:underline"
          >
            Review inventory
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-[var(--t4)]">
              <tr>
                <th className="px-5 py-3 font-medium">Vehicle</th>
                <th className="px-5 py-3 font-medium">Net estimate</th>
                <th className="px-5 py-3 font-medium">Decision</th>
                <th className="px-5 py-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--b1)]">
              {(stats?.topDeals ?? []).slice(0, 6).map((deal) => (
                <tr key={deal.id}>
                  <td className="px-5 py-3 font-medium text-[var(--t1)]">
                    {deal.year} {deal.make} {deal.model}
                  </td>
                  <td className="px-5 py-3">
                    <Mono
                      className={
                        deal.true_net_profit >= 0
                          ? "text-[var(--green)]"
                          : "text-[var(--red)]"
                      }
                    >
                      ${Math.round(deal.true_net_profit || 0).toLocaleString()}
                    </Mono>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-[var(--glo)] px-2.5 py-1 text-xs font-semibold text-[var(--green)]">
                      {deal.deal_verdict === "go"
                        ? "Buy candidate"
                        : deal.deal_verdict}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`/deal/${deal.id}`}
                      className="text-sm font-semibold text-[var(--blue)] hover:underline"
                    >
                      Deal Check
                    </a>
                  </td>
                </tr>
              ))}
              {!loading && !stats?.topDeals?.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-sm text-[var(--t4)]"
                  >
                    No ranked buy candidates are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
