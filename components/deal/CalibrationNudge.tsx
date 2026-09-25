"use client";

// Drives the outcome-logging loop that activates the calibration moat. Shows the dealer how close
// they are to unlocking pricing tuned to THEIR shop (5 logged sold flips), or confirms it's active.
// Reads the already-built /api/calibration + /api/outcomes — no new endpoints.

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Ico } from "@/components/shared/Ico";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const TARGET = 5;

export function CalibrationNudge({ compact = false }: { compact?: boolean }) {
  const { data: cal } = useSWR("/api/calibration", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: out } = useSWR("/api/outcomes", fetcher, {
    revalidateOnFocus: false,
  });

  // Not signed in / nothing to show yet → render nothing (don't nag anonymous views).
  if (!out) return null;
  const outcomes: any[] = out.outcomes || [];
  const calibration = cal?.calibration ?? null;

  // Count sold flips (the unlock condition mirrors getDealerCalibration: actual_profit present).
  const logged = outcomes.filter((o) => o.actual_profit != null).length;

  if (calibration) {
    return (
      <div
        className="glass-panel p-4 flex items-center gap-3"
        style={{ borderLeft: "3px solid var(--green)" }}
      >
        <Ico name="check-circle" size={18} className="text-[var(--green)]" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--t1)]">
            Pricing calibrated to your shop
          </p>
          <p className="text-[11px] text-[var(--t3)]">
            {calibration.sampleSize} logged flips ·{" "}
            {calibration.profitAccuracyPct}% prediction accuracy · recon ×
            {calibration.reconMultiplier}, resale ×{calibration.sellMultiplier}
          </p>
        </div>
        <Link
          href="/insights"
          className="ml-auto text-[11px] font-bold text-[var(--t4)] hover:text-[var(--t1)] shrink-0"
        >
          details →
        </Link>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((logged / TARGET) * 100));
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-2">
        <Ico name="calculator" size={15} className="text-[var(--amber)]" />
        <p className="text-sm font-bold text-[var(--t1)]">
          Unlock pricing tuned to your shop
        </p>
        <span className="ml-auto text-[11px] font-black text-[var(--t2)]">
          {logged}/{TARGET}
        </span>
      </div>
      <p className="text-[11px] text-[var(--t3)] mb-3">
        Log {TARGET - logged} more sold flip{TARGET - logged === 1 ? "" : "s"}{" "}
        and every estimate calibrates to your real recon, transport, and resale
        results.
      </p>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: "var(--s2)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--grad)" }}
        />
      </div>
      {compact ? null : (
        <Link
          href="/insights"
          className="inline-block mt-3 text-[11px] font-bold text-[var(--amber)]"
        >
          Log a sale →
        </Link>
      )}
    </div>
  );
}
