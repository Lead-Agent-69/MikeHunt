"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { RefreshCw } from "lucide-react";

// Leaflet touches `window`, so the map must be client-only (no SSR).
const DealerMap = dynamic(() => import("@/components/map/DealerMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center text-[var(--t4)] text-sm">
      Loading map…
    </div>
  ),
});

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Map unavailable");
  return response.json();
};

const FILTERS = [
  { key: "actionable", label: "Review" },
  { key: "go", label: "Go" },
  { key: "hold", label: "Hold" },
  { key: "all", label: "All" },
];

export default function MapPage() {
  const [verdict, setVerdict] = useState("actionable");
  const { data, error, isLoading, mutate } = useSWR(
    `/api/deals/map?verdict=${verdict}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );
  const points: any[] = data?.points ?? [];
  const unavailable = Boolean(error || data?.degraded);
  const approximateCount = points.filter((point) => point.approx).length;

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
            Stored listings by verdict.{" "}
            <Mono
              style={{ fontFamily: "var(--fm)" }}
              className="text-[var(--t2)] font-bold"
            >
              {points.length}
            </Mono>{" "}
            plotted.
          </p>
        </div>
        <div
          role="group"
          aria-label="Map verdict"
          className="flex flex-wrap gap-1 p-1 rounded-[var(--r3)] bg-[var(--s1)] border border-[var(--b1)]"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setVerdict(f.key)}
              aria-pressed={verdict === f.key}
              className="min-h-12 min-w-12 px-3 rounded-[var(--r2)] text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
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

      <div className="relative h-[max(400px,60vh)] md:h-[max(500px,68vh)]">
        <DealerMap points={unavailable ? [] : points} />
        {(isLoading || unavailable || points.length === 0) && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-[1000] grid place-items-center bg-[var(--s1)]/90 p-6"
          >
            <div className="max-w-sm text-center">
              <p className="font-semibold text-[var(--t1)]">
                {isLoading
                  ? "Loading listings"
                  : unavailable
                    ? "Map temporarily unavailable"
                    : "No listings in this view"}
              </p>
              {!isLoading && (
                <p className="mt-2 text-sm text-[var(--t3)]">
                  {unavailable
                    ? "We could not load the stored inventory. Try again."
                    : "Choose All to review the available inventory."}
                </p>
              )}
              {!isLoading &&
                (unavailable ? (
                  <button
                    onClick={() => void mutate()}
                    className="mt-4 inline-flex min-h-12 items-center gap-2 px-4 text-sm font-semibold text-[var(--blue)]"
                  >
                    <RefreshCw size={16} aria-hidden="true" /> Try again
                  </button>
                ) : (
                  verdict !== "all" && (
                    <button
                      onClick={() => setVerdict("all")}
                      className="mt-4 min-h-12 px-4 text-sm font-semibold text-[var(--blue)]"
                    >
                      Show all listings
                    </button>
                  )
                ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-[var(--t3)]">
        {approximateCount > 0 &&
          `${approximateCount} ${approximateCount === 1 ? "location is an approximate state-level position" : "locations are approximate state-level positions"}. `}
        Verify the seller&apos;s address before planning a trip. Review includes
        Go and Hold listings.
      </p>
    </div>
  );
}
