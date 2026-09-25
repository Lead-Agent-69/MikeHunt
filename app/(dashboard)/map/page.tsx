"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

// Leaflet touches `window`, so the map must be client-only (no SSR).
const DealerMap = dynamic(() => import("@/components/map/DealerMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center text-[var(--t4)] text-sm">
      Loading map…
    </div>
  ),
});

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FILTERS = [
  { key: "go", label: "BUY" },
  { key: "hold", label: "Hold" },
  { key: "all", label: "All" },
];

export default function MapPage() {
  const [verdict, setVerdict] = useState("go");
  const { data } = useSWR(`/api/deals/map?verdict=${verdict}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const points: any[] = data?.points ?? [];

  return (
    <div
      className="max-w-6xl mx-auto px-4 py-6 space-y-4"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Deal Map
          </h1>
          <p className="text-[var(--t3)] text-sm">
            Every geocoded live deal, by verdict.{" "}
            <Mono
              style={{ fontFamily: "var(--fm)" }}
              className="text-[var(--t2)] font-bold"
            >
              {points.length}
            </Mono>{" "}
            plotted.
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-[var(--r3)] bg-[var(--s1)] border border-[var(--b1)]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setVerdict(f.key)}
              className="px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold transition-colors"
              style={{
                background: verdict === f.key ? "var(--amber)" : "transparent",
                color: verdict === f.key ? "#fff" : "var(--t3)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[60vh] md:h-[68vh]">
        <DealerMap points={points} />
      </div>

      <p className="text-[11px] text-[var(--t4)]">
        Note: deals from sources with low-quality location data may not be
        mapped. Coordinates are geocoded from each listing&apos;s city/state.
      </p>
    </div>
  );
}
