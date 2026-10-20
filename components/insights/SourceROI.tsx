"use client";

import React from "react";
import { useDealerId } from "@/hooks/useDealerId";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

const fetcher = async ([url]: [string, string]) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Complete-cost results could not be loaded.");
  return r.json();
};
const money = (v: any) =>
  `${Number(v) < 0 ? "-" : ""}$${Math.abs(Number(v) || 0).toLocaleString()}`;

const LABELS: Record<string, string> = {
  manual: "Manually logged",
  unknown: "Unknown source",
  unspecified: "Unspecified",
};
const pretty = (k: string) =>
  LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1);

function Table({
  title,
  sub,
  rows,
}: {
  title: string;
  sub: string;
  rows: any[];
}) {
  if (!rows?.length) return null;

  return (
    <div className="glass-panel p-5">
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          {title}
        </p>
        <p className="text-[11px] text-[var(--t4)] mt-0.5">{sub}</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const good = r.avgProfit >= 0;
          return (
            <div
              key={r.key}
              className="flex items-center gap-3 py-2 px-2.5 rounded-[var(--r2)]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--t1)] capitalize truncate">
                  {pretty(r.key)}
                </p>
                <p className="text-[11px] text-[var(--t4)]">
                  {r.deals} {r.deals === 1 ? "deal" : "deals"} · {r.winRate}%
                  profitable
                  {r.avgDays != null ? ` · ${r.avgDays}d avg` : ""}
                </p>
              </div>
              <Mono
                className="text-base font-black shrink-0"
                style={{
                  fontFamily: "var(--fm)",
                  color: good ? "var(--green)" : "var(--red)",
                }}
              >
                {good ? "+" : ""}
                {money(r.avgProfit)}
              </Mono>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Source/channel ROI from the dealer's own logged outcomes. The moat: where THEY make money. */
export function SourceROI() {
  const { dealerId, loading } = useDealerId();
  const { data, error, mutate } = useSWR(
    dealerId && !loading ? ["/api/insights/source-roi", dealerId] : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  if (error)
    return (
      <div
        role="alert"
        className="rounded-lg border border-[var(--b2)] p-4 text-sm"
      >
        <p>{error.message}</p>
        <button
          type="button"
          onClick={() => mutate()}
          className="min-h-11 text-[var(--blue)] underline"
        >
          Retry complete-cost results
        </button>
      </div>
    );
  const bySource: any[] = data?.bySource ?? [];
  const byChannel: any[] = data?.byChannel ?? [];
  if (bySource.length === 0 && byChannel.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Table
        title="Net results by source"
        sub="Average net result from your complete owner-reported cost records"
        rows={bySource}
      />
      <Table
        title="Net results by sale channel"
        sub="Recorded outcomes by sale channel; small samples can vary"
        rows={byChannel}
      />
    </div>
  );
}
