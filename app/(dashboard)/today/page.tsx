"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Mono } from "@/components/shared/Mono";
import { DealTicker } from "@/components/home/DealTicker";
import { MarketPulse } from "@/components/home/MarketPulse";
import { FlashRail } from "@/components/discovery/FlashRail";
import { IntelRail } from "@/components/discovery/IntelRail";
import { CalibrationNudge } from "@/components/deal/CalibrationNudge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** The one cohesive front door: the autonomous system's live pulse, then everything worth acting on. */
function SystemPulse() {
  const { data } = useSWR("/api/system/status", fetcher, {
    refreshInterval: 300_000,
  });
  const f = data?.freshness;
  const q = data?.quality;
  const l = data?.learning;
  if (!data) return null;

  const cells = [
    {
      label: "live deals",
      value: (f?.activeDeals ?? 0).toLocaleString(),
      tone: "var(--t1)",
    },
    {
      label: "BUY now",
      value: (q?.goDeals ?? 0).toLocaleString(),
      tone: "var(--green)",
    },
    {
      label: "new today",
      value: (f?.newLast24h ?? 0).toLocaleString(),
      tone: "var(--amber)",
    },
    {
      label: f?.stale ? "data stale" : "data fresh",
      value: f?.stale ? "•" : "LIVE",
      tone: f?.stale ? "var(--red)" : "var(--green)",
    },
  ];

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          System pulse
        </p>
        <Link
          href="/status"
          className="text-[11px] text-[var(--t4)] hover:text-[var(--t1)]"
        >
          details →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {cells.map((c) => (
          <div key={c.label}>
            <Mono
              className="text-xl md:text-2xl font-black"
              style={{ fontFamily: "var(--fm)", color: c.tone }}
            >
              {c.value}
            </Mono>
            <p className="text-[10px] text-[var(--t4)] font-semibold mt-0.5">
              {c.label}
            </p>
          </div>
        ))}
      </div>
      {l?.prioritizedMakes?.length > 0 && (
        <p className="text-[11px] text-[var(--t4)] mt-3">
          Learning from your wins — prioritizing{" "}
          <span className="text-[var(--green)] font-semibold capitalize">
            {l.prioritizedMakes.slice(0, 4).join(", ")}
          </span>
          .
        </p>
      )}
    </div>
  );
}

export default function TodayPage() {
  return (
    <div
      className="max-w-6xl mx-auto px-4 py-6 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">Today</h1>
        <p className="text-[var(--t3)] text-sm">
          Your market, sourced and scored automatically. Here&apos;s what to act
          on.
        </p>
      </div>

      <DealTicker />
      <SystemPulse />
      <CalibrationNudge />
      <MarketPulse />

      {/* Everything worth acting on — each rail self-fetches and hides when empty */}
      <FlashRail />
      <IntelRail
        endpoint="/api/recommendations"
        title="🏆 Deals like your winners"
        subtitle="Matched to the make/models you've actually profited on"
      />
      <IntelRail
        endpoint="/api/deals/near"
        title="📍 Near you"
        subtitle="Closest BUY deals to your home base"
      />
      <IntelRail
        endpoint="/api/mispricing"
        title="📉 Underpriced vs peers"
        subtitle="Statistical outliers priced well under their cluster"
      />

      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-[var(--t1)]">
            Want the full grid?
          </p>
          <p className="text-xs text-[var(--t4)]">
            Search, filter, and scan every live listing.
          </p>
        </div>
        <Link
          href="/scan"
          className="px-4 py-2 rounded-[var(--r3)] font-bold text-white text-sm shrink-0"
          style={{ background: "var(--grad)" }}
        >
          Open Scan →
        </Link>
      </div>
    </div>
  );
}
