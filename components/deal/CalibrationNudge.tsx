"use client";
import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useDealerId } from "@/hooks/useDealerId";
import { completeOutcomeRows } from "@/lib/outcomes/ledger";
async function fetcher([url]: [string, string]) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("History unavailable");
  return r.json();
}
export function CalibrationNudge({ compact = false }: { compact?: boolean }) {
  const { dealerId, loading } = useDealerId();
  const { data: cal } = useSWR(
    dealerId && !loading ? ["/api/calibration", dealerId] : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: out } = useSWR(
    dealerId && !loading ? ["/api/outcomes", dealerId] : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  if (!dealerId || !out) return null;
  const count = completeOutcomeRows(out.outcomes || []).length;
  const calibration = cal?.calibration;
  return (
    <div className="rounded-xl border border-[var(--b2)] bg-[var(--s0)] p-4">
      <p className="text-sm font-semibold">
        {calibration
          ? "Personal model comparisons available"
          : "Build your actual-cost history"}
      </p>
      <p className="mt-1 text-xs text-[var(--t3)]">
        {calibration
          ? `${calibration.sampleSize} complete sales with dated snapshots. Each adjustment needs 5 matched pairs.`
          : `${count} complete sale records. Calibration needs 5 matched, dated predictions for each adjustment.`}
      </p>
      {calibration?.profitAccuracyPct != null && (
        <p className="mt-2 text-xs text-[var(--t3)]">
          Historical profit agreement {calibration.profitAccuracyPct}% ·{" "}
          {calibration.matchedSamples?.profit ?? 0} matched predictions. Future
          results can differ.
        </p>
      )}
      {!compact && (
        <Link
          href="/insights"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)] underline"
        >
          Review actual outcomes
        </Link>
      )}
    </div>
  );
}
