"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";
import { zipToState } from "@/lib/geo/zip-state";
import { US_STATES as STATE_NAMES } from "@/lib/geo/us-states";
import { proxiedImage } from "@/lib/image-url";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

// State-scoped listings only. A saved state or a ZIP's state is not a mile
// radius, and the CA dealer default is never treated as "near you".

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "—";

interface NearbyDeal {
  id: string;
  make?: string;
  model?: string;
  year?: number;
  askPrice?: number;
  locationCity?: string;
  locationState?: string;
  images?: string[];
  distanceMiles?: number;
}

function placeName(code: string) {
  const upper = code.toUpperCase();
  return STATE_NAMES[upper]?.[0] || upper;
}

export function NearbyDeals() {
  const { prefs, authed } = usePreferences();
  // Home location (#66) first; effectiveHome falls back to legacy carsState / buyerScope.state.
  const home = (effectiveHome(prefs)?.state || "").toUpperCase();
  const [zip, setZip] = useState("");
  const zipMode = /^\d{5}$/.test(zip);
  const center = (zipMode ? zipToState(zip) : home) || "";

  // Profit ranking is flip-desk only (the server also downgrades it). Everyone else gets the
  // trust/proof ranking so the order never encodes a hidden profit number.
  const sort = isFlipBuyerMode(prefs?.buyerScope?.buyerMode)
    ? "profit"
    : "score";
  const key = center ? `/api/scan?states=${center}&sort=${sort}` : null;
  const { data, isLoading } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
    keepPreviousData: true,
  });

  const zipBox = (
    <input
      inputMode="numeric"
      maxLength={5}
      value={zip}
      onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
      placeholder="ZIP"
      aria-label="Limit listings to a ZIP code's state"
      className="min-h-12 w-24 rounded-lg border border-[var(--b1)] bg-[var(--s2)] px-3 text-sm font-semibold text-[var(--t1)] outline-none focus:border-[var(--b3)]"
    />
  );

  if (authed && !center) {
    return (
      <div className="rounded-[var(--r3)] border border-dashed border-[var(--b2)] p-4 text-sm text-[var(--t4)]">
        <div className="mb-2 flex items-center gap-2">
          {zipBox}
          <span>
            Set a home state in Settings, or enter a ZIP to scope listings.
          </span>
        </div>
      </div>
    );
  }
  if (!center) return null;

  const deals: NearbyDeal[] = (data?.vehicles || data?.deals || []).slice(0, 8);
  const label = placeName(center);

  return (
    <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[var(--t1)]">{label} only</h2>
          <p className="text-xs text-[var(--t4)]">
            City and state from each listing. Miles show only when distance is
            known.
          </p>
        </div>
        {zipBox}
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-xs text-[var(--t4)]">Loading…</p>
      ) : deals.length === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--t4)]">
          No listings in {label} yet.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {deals.map((d) => {
            const miles =
              typeof d.distanceMiles === "number" ? d.distanceMiles : null;
            const cityState = [d.locationCity, d.locationState]
              .filter(Boolean)
              .join(", ");
            const where =
              miles != null
                ? `About ${Math.round(miles)} miles${zipMode ? ` from ${zip}` : ""}`
                : cityState || label;
            return (
              <Link
                key={d.id}
                href={`/deal/${d.id}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-2.5 transition-colors hover:border-[var(--b3)]"
              >
                <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--s2)]">
                  {d.images?.[0] && d.images[0].startsWith("http") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxiedImage(d.images[0])}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-lg opacity-40" aria-hidden>
                      🚗
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-[var(--t1)]">
                    {d.year} {d.make} {d.model}
                  </div>
                  <div className="text-[11px] text-[var(--t4)]">
                    {money(d.askPrice)} · {where}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
