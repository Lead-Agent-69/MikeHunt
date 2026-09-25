"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const { data } = useSWR(`/api/deal-iq/${dealId}`, fetcher, {
    revalidateOnFocus: false,
  });
  const iq = data?.iq;
  if (!iq) return null;

  const tier = TIER[iq.tier] || TIER.fair;
  const circumference = 2 * Math.PI * 26;

  return (
    <div className="glass-panel p-5 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Deal IQ
        </p>
        <span className="text-[10px] text-[var(--t5)]">
          fused from every signal
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
          <div key={s.key} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[var(--t3)] w-28 shrink-0">
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
            <span className="text-[11px] text-[var(--t4)] w-40 shrink-0 truncate text-right">
              {s.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
