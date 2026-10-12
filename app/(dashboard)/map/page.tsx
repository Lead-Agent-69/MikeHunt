"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { RefreshCw } from "lucide-react";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import {
  titleFilterOptions,
  titleTypeFromQuery,
  withTitleType,
} from "@/lib/deals/title-filter-options";

const MAP_TITLE_OPTIONS = titleFilterOptions(null, "Any title");

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
  const { query: scopeQuery, ready, intent } = useInventoryViewScope();
  // null = follow the saved scope's titleType; otherwise the map-only title choice.
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  const query = withTitleType(scopeQuery, titleFilter);
  const flipDesk = isFlipBuyerMode(intent?.buyerMode);
  const [verdict, setVerdict] = useState("actionable");
  const { data, error, isLoading, mutate } = useSWR(
    ready
      ? `/api/deals/map?${query}&verdict=${flipDesk ? verdict : "all"}`
      : null,
    fetcher,
    {
      revalidateOnFocus: true,
      keepPreviousData: false,
      dedupingInterval: 60_000,
    },
  );
  const points: any[] = data?.points ?? [];
  const unavailable = Boolean(error || data?.degraded);
  const approximateCount = points.filter((point) => point.approx).length;

  return (
    <div
      className="max-w-6xl mx-auto md:px-4 py-6 space-y-4"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Deal Map
          </h1>
          <p className="text-[var(--t3)] text-sm">
            Stored listings.{" "}
            <Mono
              style={{ fontFamily: "var(--fm)" }}
              className="text-[var(--t2)] font-bold"
            >
              {points.length}
            </Mono>{" "}
            plotted.
          </p>
        </div>
        {flipDesk && (
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
                  background:
                    verdict === f.key ? "var(--amber)" : "transparent",
                  color: verdict === f.key ? "#fff" : "var(--t3)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <InventoryViewLinks query={query} current="/map" />
      <label className="flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
        Title
        <select
          aria-label="Title filter"
          value={titleTypeFromQuery(query)}
          onChange={(event) => setTitleFilter(event.target.value)}
          className="min-h-11 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-2 text-xs text-[var(--t1)]"
        >
          {MAP_TITLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {data?.limited && (
        <p role="status" className="text-xs text-[var(--t3)]">
          Limited map sample: up to {data.limit} located listings.
        </p>
      )}

      <div className="relative h-[max(400px,60vh)] md:h-[max(500px,68vh)]">
        <DealerMap points={unavailable ? [] : points} />
        {(!ready || isLoading || unavailable || points.length === 0) && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-[1000] grid place-items-center bg-[var(--s1)]/90 p-6"
          >
            <div className="max-w-sm text-center">
              <p className="font-semibold text-[var(--t1)]">
                {!ready || isLoading
                  ? "Loading listings"
                  : unavailable
                    ? "Map temporarily unavailable"
                    : "No listings in this view"}
              </p>
              {ready && !isLoading && (
                <p className="mt-2 text-sm text-[var(--t3)]">
                  {unavailable
                    ? "We could not load the stored inventory. Try again."
                    : "Choose All to review the available inventory."}
                </p>
              )}
              {ready &&
                !isLoading &&
                (unavailable ? (
                  <button
                    onClick={() => void mutate()}
                    className="mt-4 inline-flex min-h-12 items-center gap-2 px-4 text-sm font-semibold text-[var(--blue)]"
                  >
                    <RefreshCw size={16} aria-hidden="true" /> Try again
                  </button>
                ) : (
                  flipDesk &&
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
        Verify the seller&apos;s address before planning a trip.
        {flipDesk && " Review includes Go and Hold listings."}
      </p>
    </div>
  );
}
