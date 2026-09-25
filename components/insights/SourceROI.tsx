"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
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
  const best = rows[0]?.key;
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
              style={{
                background: r.key === best ? "var(--glo)" : "transparent",
                border:
                  r.key === best
                    ? "0.5px solid var(--green)"
                    : "0.5px solid transparent",
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--t1)] capitalize truncate">
                  {pretty(r.key)}
                  {r.key === best && (
                    <span className="ml-2 text-[10px] text-[var(--green)] font-bold uppercase tracking-wider">
                      best
                    </span>
                  )}
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
  const { data } = useSWR("/api/insights/source-roi", fetcher, {
    revalidateOnFocus: false,
  });
  const bySource: any[] = data?.bySource ?? [];
  const byChannel: any[] = data?.byChannel ?? [];
  if (bySource.length === 0 && byChannel.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Table
        title="ROI by source"
        sub="Avg net profit per deal, by where you bought it"
        rows={bySource}
      />
      <Table
        title="ROI by exit channel"
        sub="Where your cars sell best"
        rows={byChannel}
      />
    </div>
  );
}
