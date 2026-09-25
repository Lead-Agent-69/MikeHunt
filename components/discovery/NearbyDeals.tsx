"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePreferences } from "@/hooks/usePreferences";
import { nearbyStates } from "@/lib/geo/us-states";
import { zipToState } from "@/lib/geo/zip-state";
import { proxiedImage } from "@/lib/image-url";

// "Deals near you" — a customizable dashboard widget that surfaces engine-rated BUY deals in the user's
// saved state + surrounding states (radius adjustable). Reads the saved carsState from /api/preferences,
// so it personalizes to the user's location. Hidden until a state is set (prompt points to Settings).

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "—";

interface NearbyDeal {
  id: string;
  make?: string;
  model?: string;
  year?: number;
  askPrice?: number;
  true_net_profit?: number;
  locationState?: string;
  images?: string[];
  distanceMiles?: number;
}

const RADII = [
  { n: 2, label: "Close" },
  { n: 4, label: "Nearby" },
  { n: 7, label: "Wide" },
];

export function NearbyDeals() {
  const { prefs, authed } = usePreferences();
  const home = (prefs.carsState || "").toUpperCase();
  const [radius, setRadius] = useState(4);
  const [zip, setZip] = useState("");
  const zipMode = /^\d{5}$/.test(zip);

  // A ZIP resolves to its STATE — which works for EVERY car (via location_state); only ~15% of cars are
  // geocoded, so a pure lat/lng distance search misses most and reads "nothing here". We then widen to
  // nearby states by radius, so entering a ZIP is "smart enough to bring near" instead of empty. Sorted by
  // profit (best first) and NOT hard-filtered to BUY — real BUYs are scarce, so a BUY-only filter looked
  // broken; the card still badges each deal's verdict.
  const center = (zipMode ? zipToState(zip) : home) || "";
  const states = center
    ? [center, ...Array.from(nearbyStates(center, radius))]
    : [];
  const key = states.length
    ? `/api/scan?states=${states.join(",")}&sort=profit`
    : null;
  const { data, isLoading } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
    keepPreviousData: true, // keep deals visible while changing radius/zip — no flash
  });

  const zipBox = (
    <input
      inputMode="numeric"
      maxLength={5}
      value={zip}
      onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
      placeholder="ZIP"
      aria-label="Search deals near a ZIP code"
      className="w-16 rounded-full border border-[var(--b1)] bg-[var(--s2)] px-3 py-1 text-[12px] font-semibold text-[var(--t1)] outline-none focus:border-[var(--b3)]"
    />
  );

  // No saved market AND no usable ZIP → nudge, but let them search a ZIP right here.
  if (authed && !center) {
    return (
      <div className="rounded-[var(--r3)] border border-dashed border-[var(--b2)] p-4 text-sm text-[var(--t4)]">
        <div className="mb-2 flex items-center gap-2">
          {zipBox}
          <span>enter a ZIP to see deals near you,</span>
        </div>
        or set your home market in{" "}
        <Link href="/settings" className="font-semibold text-[var(--t2)]">
          Settings
        </Link>
        .
      </div>
    );
  }
  if (!center) return null;

  const deals: NearbyDeal[] = (data?.vehicles || data?.deals || []).slice(0, 8);

  return (
    <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-black text-[var(--t1)]">
          Best deals near {zipMode ? zip : home}
        </h2>
        <div className="flex items-center gap-2">
          {zipBox}
          {/* Radius selector — how far to widen from the home/ZIP state. */}
          {
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-full"
              style={{ background: "var(--s2)" }}
            >
              {RADII.map((r) => {
                const active = radius === r.n;
                return (
                  <button
                    key={r.n}
                    onClick={() => setRadius(r.n)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      background: active ? "var(--s0)" : "transparent",
                      color: active ? "var(--t1)" : "var(--t4)",
                      boxShadow: active ? "var(--shadow2)" : "none",
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          }
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-[var(--t4)] py-6 text-center">Loading…</p>
      ) : deals.length === 0 ? (
        <p className="text-xs text-[var(--t4)] py-6 text-center">
          No deals in {states.join(", ")} yet — widen the radius
          {zipMode ? " or try a nearby ZIP" : ""}.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {deals.map((d) => (
            <Link
              key={d.id}
              href={`/deal/${d.id}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-2.5 hover:border-[var(--b3)] transition-colors"
            >
              <div className="h-12 w-16 shrink-0 rounded-lg bg-[var(--s2)] overflow-hidden grid place-items-center">
                {d.images?.[0] && d.images[0].startsWith("http") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxiedImage(d.images[0])}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  // No photo → a subtle car glyph instead of an empty box.
                  <span className="text-lg opacity-40" aria-hidden>
                    🚗
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-[var(--t1)] truncate">
                  {d.year} {d.make} {d.model}
                </div>
                <div className="text-[11px] text-[var(--t4)]">
                  {money(d.askPrice)} ·{" "}
                  {d.distanceMiles != null
                    ? `${d.distanceMiles} mi`
                    : d.locationState}
                  {d.true_net_profit != null && d.true_net_profit > 0 && (
                    <span className="text-[var(--green)] font-bold">
                      {" "}
                      · +{money(d.true_net_profit)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
