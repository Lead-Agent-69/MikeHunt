"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

const fetcher = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Vehicle research is unavailable");
  return response.json();
};

const TIER: Record<string, { label: string; color: string }> = {
  elite: { label: "Elite", color: "var(--green)" },
  strong: { label: "Strong", color: "var(--amber)" },
  fair: { label: "Fair", color: "var(--blue)" },
  weak: { label: "Weak", color: "var(--t4)" },
};

function barColor(score: number) {
  if (score >= 70) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

/** Deal IQ — fused, explainable intelligence score with per-signal contributions. */
export function DealIQCard({ dealId }: { dealId: string }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/deal-iq/${dealId}`,
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const iq = data?.evidence?.ready === true ? data?.iq : null;
  if (error)
    return (
      <div className="space-y-3" role="status">
        <p>
          Vehicle research could not be loaded. Your vehicle details are still
          available.
        </p>
        <button
          type="button"
          disabled={isValidating}
          onClick={() => void mutate().catch(() => undefined)}
          className="premium-focus min-h-11 rounded-full bg-[var(--accent-surface)] px-4 text-[var(--accent)]"
        >
          {isValidating ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  if (isLoading) return <p role="status">Checking the recorded evidence…</p>;
  if (!iq)
    return (
      <div className="space-y-3 text-sm text-[var(--t2)]">
        <p className="font-semibold text-[var(--t1)]">
          {data?.evidence?.label || "Needs evidence"}
        </p>
        <p>Profit and a buying score are not established for this vehicle.</p>
        <p>
          {data?.evidence?.nextCheck ||
            "Confirm the purchase price, title, condition, total costs and comparable completed sales."}
        </p>
        {data?.evidence?.priceMeaning && (
          <p>Price meaning: {data.evidence.priceMeaning}</p>
        )}
        {data?.evidence?.observedAt && (
          <p>
            Source observed:{" "}
            <time dateTime={data.evidence.observedAt}>
              {new Date(data.evidence.observedAt).toLocaleString()}
            </time>
          </p>
        )}
        {data?.evidence?.sourceUrl && (
          <a
            className="premium-focus inline-flex min-h-11 items-center font-semibold text-[var(--blue)]"
            href={data.evidence.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check original listing ↗
          </a>
        )}
      </div>
    );

  const tier = TIER[iq.tier] || TIER.fair;
  const circumference = 2 * Math.PI * 26;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Deal IQ
        </p>
        <span className="text-[10px] text-[var(--t5)]">
          recorded evidence and outcomes
        </span>
      </div>

      <div className="flex items-center gap-5">
        {/* Score ring */}
        <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" className="-rotate-90">
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="var(--b1)"
              strokeWidth="6"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke={tier.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - iq.score / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Mono
              className="text-xl font-black text-[var(--t1)]"
              style={{ fontFamily: "var(--fm)" }}
            >
              {iq.score}
            </Mono>
          </div>
        </div>

        <div className="min-w-0">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "var(--s2)", color: tier.color }}
          >
            {tier.label} buy
          </span>
          <p className="text-sm text-[var(--t2)] mt-1.5 leading-snug">
            {iq.headline}
          </p>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="mt-4 space-y-2">
        {iq.signals.map((s: any) => (
          <div
            key={s.key}
            className="grid min-w-0 gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)_10rem] sm:items-center sm:gap-3"
          >
            <span className="text-xs font-semibold text-[var(--t3)]">
              {s.label}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--b1)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${s.score}%`, background: barColor(s.score) }}
              />
            </div>
            <span className="text-[11px] text-[var(--t3)] break-words sm:text-right">
              {s.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
