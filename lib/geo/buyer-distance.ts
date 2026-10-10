// lib/geo/buyer-distance.ts
// Buyer-home → listing distance, by haversine, with an explicit basis so callers never pass a
// made-up mile count off as measured.
//
// Resolution order (best evidence first):
//   1. "coords"         — both sides have real lat/lng → great-circle miles × ROAD_FACTOR.
//   2. "state_centroid" — different states (from state code or ZIP prefix) → centroid haversine ×
//                         ROAD_FACTOR. Coarse but real geometry.
//   3. "same_state"     — same state, no coordinates → miles UNKNOWN (null). We used to return a
//                         hardcoded 45; now the caller books the carrier minimum instead of
//                         pretending we measured a distance.
//   4. "unknown"        — no usable home or listing location.
//
// Pure, no I/O. ZIP → state uses the USPS 3-digit prefix table (lib/geo/zip-state); there is no
// ZIP-centroid table on the free tier, so a ZIP alone resolves to its state centroid.

import { STATE_COORDS, transportCostForMiles } from "@/lib/geo";
import { haversineMiles } from "./distance";
import { zipToState } from "./zip-state";

/** Straight-line → driving miles. Same factor lib/geo getDrivingMiles has always used. */
export const ROAD_FACTOR = 1.3;

export interface GeoPoint {
  lat?: number | string | null;
  lng?: number | string | null;
  zip?: string | null;
  state?: string | null;
}

export type DistanceBasis =
  | "coords"
  | "state_centroid"
  | "same_state"
  | "unknown";

export interface BuyerDistance {
  /** Estimated driving miles. Null when we can't measure (same-state without coords, unknown). */
  miles: number | null;
  basis: DistanceBasis;
  homeState: string | null;
  listingState: string | null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Two-letter state from an explicit state code, else from the ZIP prefix. Null when neither works. */
export function resolvePointState(p?: GeoPoint | null): string | null {
  if (!p) return null;
  const st = String(p.state || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{2}$/.test(st) && st !== "NATIONWIDE") return st;
  const zip = String(p.zip || "").trim();
  if (/^\d{5}/.test(zip)) return zipToState(zip.slice(0, 5));
  return null;
}

function coordsOf(p?: GeoPoint | null): { lat: number; lng: number } | null {
  if (!p) return null;
  const lat = num(p.lat);
  const lng = num(p.lng);
  if (lat == null || lng == null) return null;
  if (lat === 0 && lng === 0) return null; // null-island placeholder, not a location
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Driving-miles estimate from the buyer's home to a listing. Never invents a distance. */
export function buyerDistance(
  home?: GeoPoint | null,
  listing?: GeoPoint | null,
): BuyerDistance {
  const homeState = resolvePointState(home);
  const listingState = resolvePointState(listing);
  const a = coordsOf(home);
  const b = coordsOf(listing);
  if (a && b) {
    const d = haversineMiles(a.lat, a.lng, b.lat, b.lng);
    if (d != null)
      return {
        miles: Math.round(d * ROAD_FACTOR),
        basis: "coords",
        homeState,
        listingState,
      };
  }
  if (homeState && listingState) {
    if (homeState === listingState)
      return { miles: null, basis: "same_state", homeState, listingState };
    const ca = STATE_COORDS[homeState];
    const cb = STATE_COORDS[listingState];
    if (ca && cb) {
      const d = haversineMiles(ca.lat, ca.lon, cb.lat, cb.lon);
      if (d != null)
        return {
          miles: Math.round(d * ROAD_FACTOR),
          basis: "state_centroid",
          homeState,
          listingState,
        };
    }
  }
  return { miles: null, basis: "unknown", homeState, listingState };
}

/**
 * Carrier cost for a BuyerDistance. Measured miles → per-mile rate. Same state without coords →
 * the carrier minimum (a floor, not a guessed mileage). Unknown → `unknownCost` (the caller's
 * conservative national default) or null when the caller wants to keep its stored number.
 */
export function transportCostForDistance(
  d: BuyerDistance,
  unknownCost: number | null,
): number | null {
  if (d.miles != null) return transportCostForMiles(d.miles);
  if (d.basis === "same_state") return transportCostForMiles(0);
  return unknownCost;
}
