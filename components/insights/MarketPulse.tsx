"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** AI Market Pulse — Deal IQ Layer 4. Explicit-generate (no auto-spend), cached 12h server-side. */
export function MarketPulse() {
  const { data, mutate } = useSWR("/api/market/analyst", fetcher, {
    revalidateOnFocus: false,
  });
  const [generating, setGenerating] = useState(false);

  if (data && !data.report && data.canGenerate === false && !data.reason)
    return null;

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/market/analyst?generate=1").then((r) =>
        r.json(),
      );
      mutate(res, false);
    } finally {
      setGenerating(false);
    }
  }

  const report: string | null = data?.report ?? null;

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Ico name="bot" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            AI Market Pulse
          </p>
        </div>
        {report && (
          <button
            onClick={generate}
            disabled={generating}
            className="text-[11px] font-semibold text-[var(--t4)] hover:text-[var(--amber)] disabled:opacity-50"
          >
            {generating ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>
      {report ? (
        <p className="text-sm text-[var(--t2)] whitespace-pre-line leading-relaxed">
          {report}
        </p>
      ) : data?.reason ? (
        <p className="text-sm text-[var(--t4)]">{data.reason}</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--t4)]">
            A plain-English read on where the market's moving, from your own
            accumulated data.
          </p>
          <button
            onClick={generate}
            disabled={generating}
            className="shrink-0 px-4 py-2 rounded-[var(--r3)] font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "var(--grad)" }}
          >
            {generating ? "Analyzing…" : "Generate"}
          </button>
        </div>
      )}
    </div>
  );
}
