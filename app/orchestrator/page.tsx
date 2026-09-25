"use client";

import useSWR from "swr";
import { ErrorState } from "@/components/shared/ErrorState";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch health data");
    return res.json();
  });

interface SourceHealth {
  id: string;
  name: string;
  type: string;
  priority: string;
  enabled: boolean;
  frequencyMinutes: number;
  isDue: boolean;
  lastRunAt: string | null;
  lastStatus: string;
  lastError: string | null;
  totalRuns: number;
  failedRuns: number;
  successRate: number;
  estimatedDealsPerRun?: number;
}

interface HealthResponse {
  total: number;
  enabled: number;
  due: number;
  healthy: number;
  sources: SourceHealth[];
}

function statusStyle(status: string, successRate: number) {
  if (status === "never_run")
    return {
      dot: "bg-[var(--t5)]",
      text: "text-[var(--t4)]",
      label: "Never run",
    };
  if (status === "error")
    return {
      dot: "bg-[var(--red)]",
      text: "text-[var(--red)]",
      label: "Failed",
    };
  if (successRate >= 80)
    return {
      dot: "bg-[var(--green)]",
      text: "text-[var(--green)]",
      label: "Healthy",
    };
  return {
    dot: "bg-[var(--amber)]",
    text: "text-[var(--amber)]",
    label: "Degraded",
  };
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 1000 / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function OrchestratorDashboard() {
  const { data, error, isLoading, mutate } = useSWR<HealthResponse>(
    "/api/scrape/health",
    fetcher,
    {
      refreshInterval: 90000,
    },
  );

  return (
    <div
      className="min-h-screen p-8 font-sans"
      style={{ background: "var(--s1)", color: "var(--t1)" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div
          className="mb-8 pb-6 relative"
          style={{ borderBottom: "1px solid var(--b1)" }}
        >
          <div className="mt-4">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--t1)] mb-2">
              Scraper Orchestration Engine
            </h1>
            <p className="text-sm text-[var(--t4)]">
              {data
                ? `Monitoring ${data.total} sources from recent run history.`
                : "Loading source status…"}
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="glass-panel p-12 text-center text-[var(--t4)]">
            Loading health data…
          </div>
        )}

        {error && !isLoading && (
          <ErrorState
            title="Couldn't load scraper health"
            message={error.message}
            onRetry={() => mutate()}
            compact
          />
        )}

        {data && !isLoading && (
          <>
            {/* Top KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="glass-panel p-5">
                <div className="text-sm text-[var(--t4)] mb-1">
                  Total Sources
                </div>
                <div className="text-2xl font-bold font-mono text-[var(--t1)]">
                  {data.total}
                </div>
              </div>
              <div className="glass-panel p-5">
                <div className="text-sm text-[var(--t4)] mb-1">Enabled</div>
                <div className="text-2xl font-bold font-mono text-[var(--t1)]">
                  {data.enabled}
                </div>
              </div>
              <div className="glass-panel p-5">
                <div className="text-sm text-[var(--t4)] mb-1">
                  Healthy (≥80%)
                </div>
                <div className="text-2xl font-bold font-mono text-[var(--green)]">
                  {data.healthy}
                </div>
              </div>
              <div className="glass-panel p-5">
                <div className="text-sm text-[var(--t4)] mb-1">Due to Run</div>
                <div className="text-2xl font-bold font-mono text-[var(--coral)]">
                  {data.due}
                </div>
              </div>
            </div>

            {/* Source Matrix */}
            <h2 className="text-xl font-bold text-[var(--t1)] mb-4">
              Source Matrix & Status
            </h2>
            <div className="glass-panel overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="text-[var(--t4)] text-xs uppercase tracking-wider"
                    style={{ background: "var(--s2)" }}
                  >
                    <th
                      className="p-4"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Source Name
                    </th>
                    <th
                      className="p-4"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Type
                    </th>
                    <th
                      className="p-4"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Priority
                    </th>
                    <th
                      className="p-4"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Frequency
                    </th>
                    <th
                      className="p-4"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Last Run
                    </th>
                    <th
                      className="p-4"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Success Rate
                    </th>
                    <th
                      className="p-4 text-right"
                      style={{ borderBottom: "1px solid var(--b1)" }}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="text-sm" style={{ borderColor: "var(--b1)" }}>
                  {data.sources.map((source) => {
                    const style = statusStyle(
                      source.lastStatus,
                      source.successRate,
                    );
                    return (
                      <tr
                        key={source.id}
                        className="transition-colors hover:bg-[var(--s2)]"
                        style={{ borderTop: "1px solid var(--b1)" }}
                      >
                        <td className="p-4 font-medium text-[var(--t1)]">
                          {source.name}
                        </td>
                        <td className="p-4">
                          <span
                            className="px-2 py-1 rounded text-xs text-[var(--blue)]"
                            style={{ background: "var(--blo)" }}
                          >
                            {source.type}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              source.priority === "high"
                                ? "text-[var(--red)]"
                                : source.priority === "medium"
                                  ? "text-[var(--amber)]"
                                  : "text-[var(--t4)]"
                            }`}
                            style={{
                              background:
                                source.priority === "high"
                                  ? "var(--rlo)"
                                  : source.priority === "medium"
                                    ? "var(--alo)"
                                    : "var(--s2)",
                            }}
                          >
                            {source.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-[var(--t3)]">
                          Every {source.frequencyMinutes}m
                        </td>
                        <td className="p-4 font-mono text-[var(--t3)]">
                          {timeAgo(source.lastRunAt)}
                        </td>
                        <td className="p-4 font-mono text-[var(--t3)]">
                          {source.totalRuns > 0
                            ? `${source.successRate}% (${source.totalRuns} runs)`
                            : "—"}
                        </td>
                        <td className="p-4 text-right">
                          <span
                            className={`flex items-center justify-end ${style.text}`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${style.dot} mr-2`}
                            ></span>
                            {style.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
