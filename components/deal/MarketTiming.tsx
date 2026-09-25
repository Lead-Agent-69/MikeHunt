"use client";

import React from "react";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STYLE: Record<
  string,
  { bg: string; color: string; label: string; arrow: string }
> = {
  BUY_NOW: {
    bg: "var(--glo)",
    color: "var(--green)",
    label: "Buy now",
    arrow: "↑",
  },
  WAIT: {
    bg: "var(--rlo)",
    color: "var(--red)",
    label: "Consider waiting",
    arrow: "↓",
  },
  NEUTRAL: { bg: "var(--s2)", color: "var(--t3)", label: "Stable", arrow: "→" },
};

/** Market-timing badge for the deal page — buy-now/wait + real days-to-sell when available. */
export function MarketTiming({
  make,
  model,
}: {
  make?: string | null;
  model?: string | null;
}) {
  const key =
    make && model
      ? `/api/market/timing?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
      : null;
  const { data } = useSWR(key, fetcher, { revalidateOnFocus: false });

  if (!data || (!data.timing_signal && data.avg_days_to_sell == null))
    return null;
  const s = data.timing_signal ? STYLE[data.timing_signal] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {s && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r2)]"
          style={{ background: s.bg, color: s.color }}
        >
          <Ico name="trending-up" size={14} />
          <span className="text-xs font-bold">
            {s.arrow} {s.label}
          </span>
          {data.pct_change_30d != null && (
            <span className="text-xs font-semibold">
              {data.pct_change_30d > 0 ? "+" : ""}
              {data.pct_change_30d}% / 30d
            </span>
          )}
        </div>
      )}
      {data.avg_days_to_sell != null && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r2)]"
          style={{ background: "var(--s2)" }}
        >
          <Ico name="clock" size={14} className="text-[var(--t4)]" />
          <span className="text-xs font-bold text-[var(--t2)]">
            ~{data.avg_days_to_sell}d to sell
          </span>
        </div>
      )}
    </div>
  );
}
