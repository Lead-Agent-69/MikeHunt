"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** At-a-glance market intelligence strip for the top of Discover. Hides until there's data. */
export function MarketSummary() {
  const { data } = useSWR("/api/dashboard/summary", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  if (!data) return null;

  const stats: {
    label: string;
    value: React.ReactNode;
    sub?: string;
    color?: string;
  }[] = [
    {
      label: "New BUY today",
      value: data.newGoToday ?? 0,
      sub: `${data.activeGo ?? 0} active`,
    },
  ];
  if (data.avgDaysToSell != null)
    stats.push({
      label: "Avg days to sell",
      value: `${data.avgDaysToSell}d`,
      sub: "logged outcomes",
    });
  if (data.topMover) {
    const m = data.topMover;
    const up = m.pctChange > 0;
    stats.push({
      label: "Biggest mover",
      value: `${m.make} ${m.model}`,
      sub: `${up ? "+" : ""}${m.pctChange}% · ${m.signal === "BUY_NOW" ? "buy now" : m.signal === "WAIT" ? "wait" : "flat"}`,
      color:
        m.signal === "BUY_NOW"
          ? "var(--green)"
          : m.signal === "WAIT"
            ? "var(--red)"
            : undefined,
    });
  }

  if (stats.length === 1 && (data.newGoToday ?? 0) === 0) return null;

  return (
    <div className="glass-panel p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-0.5">
            {s.label}
          </p>
          <Mono
            className="text-lg font-black"
            style={{ fontFamily: "var(--fm)", color: s.color || "var(--t1)" }}
          >
            {s.value}
          </Mono>
          {s.sub && (
            <p className="text-[11px] text-[var(--t4)] truncate">{s.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
