"use client";

import React from "react";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Market timing unavailable");
  return response.json();
};

const STYLE: Record<
  string,
  { bg: string; color: string; label: string; arrow: string }
> = {
  BUY_NOW: {
    bg: "var(--glo)",
    color: "var(--green)",
    label: "Asking prices rising",
    arrow: "↑",
  },
  WAIT: {
    bg: "var(--rlo)",
    color: "var(--red)",
    label: "Asking prices softening",
    arrow: "↓",
  },
  NEUTRAL: {
    bg: "var(--s2)",
    color: "var(--t3)",
    label: "Asking prices stable",
    arrow: "→",
  },
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
  const sampleCount = Number(data.data_points);
  const s =
    Number.isFinite(sampleCount) && sampleCount >= 5 && data.timing_signal
      ? STYLE[data.timing_signal]
      : null;
  const daysToSell = Number(data.avg_days_to_sell);
  const hasDaysToSell =
    data.avg_days_to_sell != null &&
    Number.isFinite(daysToSell) &&
    daysToSell >= 0;
  if (!s && !hasDaysToSell) return null;

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
          {data.pct_change_30d != null &&
            Number.isFinite(Number(data.pct_change_30d)) && (
              <span className="text-xs font-semibold">
                {data.pct_change_30d > 0 ? "+" : ""}
                {data.pct_change_30d}% / recent vs prior observations
              </span>
            )}
        </div>
      )}
      {s && (
        <span className="text-xs text-[var(--t4)]">
          {sampleCount} listings / 30-day observations; not a purchase
          recommendation
        </span>
      )}
      {hasDaysToSell && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r2)]"
          style={{ background: "var(--s2)" }}
        >
          <Ico name="clock" size={14} className="text-[var(--t4)]" />
          <span className="text-xs font-bold text-[var(--t2)]">
            {daysToSell}d average in logged outcomes
          </span>
        </div>
      )}
    </div>
  );
}
