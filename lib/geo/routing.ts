// Real driving distance + duration via OSRM (the OpenStreetMap routing engine) — free, key-less,
// no account. This replaces the old "straight-line × 1.3" fudge used for transport cost, which is both
// imprecise interstate (Dallas→Atlanta: fudge says 936mi, real road is 782) AND badly wrong intrastate
// (San Diego→Sacramento read as "same state, 45mi" when it's a 504mi haul). Transport cost feeds
// true_net_profit / GO-PASS, so road-accurate miles = more honest money math.
//
// OSRM public demo server (router.project-osrm.org) is fine for our on-demand, cached volume; if it's
// ever unreachable we fall back to haversine × a road factor so a quote is ALWAYS returned (best-effort,
// never blocks). A module-level cache collapses repeat routes (the same metros recur constantly) to one
// network call per warm instance. Self-host OSRM later for unlimited volume — same code, swap the host.

import { haversineMiles } from "./distance";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DriveRoute {
  miles: number;
  minutes: number;
  /** "road" = real OSRM route; "estimate" = haversine fallback when OSRM was unreachable. */
  mode: "road" | "estimate";
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; json: () => Promise<any> }>;

const OSRM_BASE =
  process.env.OSRM_HOST?.replace(/\/$/, "") ||
  "https://router.project-osrm.org";

const METERS_PER_MILE = 1609.344;
// When OSRM is unreachable: real roads run ~1.3× the great-circle distance, at ~55 mph average.
const ROAD_FACTOR = 1.3;
const FALLBACK_MPH = 55;

// Warm-instance cache: key by coords rounded to ~1km so near-identical lots share a route.
const memo = new Map<string, DriveRoute>();
const MEMO_MAX = 5000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function routeKey(a: LatLng, b: LatLng): string {
  return `${round2(a.lat)},${round2(a.lng)}>${round2(b.lat)},${round2(b.lng)}`;
}

function fallbackRoute(from: LatLng, to: LatLng): DriveRoute | null {
  const straight = haversineMiles(from.lat, from.lng, to.lat, to.lng);
  if (straight == null) return null;
  const miles = Math.round(straight * ROAD_FACTOR);
  return {
    miles,
    minutes: Math.round((miles / FALLBACK_MPH) * 60),
    mode: "estimate",
  };
}

/** Parse an OSRM /route response → {miles, minutes}, or null if it's not a usable route. */
export function parseOsrm(
  body: any,
): { miles: number; minutes: number } | null {
  if (!body || body.code !== "Ok") return null;
  const r = Array.isArray(body.routes) ? body.routes[0] : null;
  if (!r || typeof r.distance !== "number" || typeof r.duration !== "number")
    return null;
  if (r.distance <= 0) return null;
  return {
    miles: Math.round(r.distance / METERS_PER_MILE),
    minutes: Math.round(r.duration / 60),
  };
}

/**
 * Real driving route between two points. Tries OSRM (cached), falls back to a haversine estimate so a
 * result is always returned for valid coords. Returns null only when the coordinates themselves are bad.
 */
export async function roadRoute(
  from: LatLng,
  to: LatLng,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<DriveRoute | null> {
  if (
    !from ||
    !to ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  )
    return null;

  const key = routeKey(from, to);
  const cached = memo.get(key);
  if (cached) return cached;

  const fetchImpl =
    opts.fetchImpl || (globalThis.fetch as unknown as FetchLike);
  let result: DriveRoute | null = null;
  try {
    // OSRM wants lon,lat order.
    const url = `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": "DealerHuntPro/1.0 (transport routing)" },
    });
    if (res.ok) {
      const parsed = parseOsrm(await res.json());
      if (parsed) result = { ...parsed, mode: "road" };
    }
  } catch {
    /* network/parse failure → fall through to estimate */
  }

  if (!result) result = fallbackRoute(from, to);
  if (result) {
    if (memo.size >= MEMO_MAX) memo.clear(); // crude bound; routes are cheap to recompute
    memo.set(key, result);
  }
  return result;
}

/** Convenience: just the road miles (estimate fallback included). */
export async function roadDistanceMiles(
  from: LatLng,
  to: LatLng,
  opts: { fetchImpl?: FetchLike } = {},
): Promise<number | null> {
  const r = await roadRoute(from, to, opts);
  return r ? r.miles : null;
}
