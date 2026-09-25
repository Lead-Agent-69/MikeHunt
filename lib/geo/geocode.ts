// Free, key-less geocoding with a persistent cache (geocode_cache table).
//   - ZIP        → api.zippopotam.us/us/<zip>
//   - city+state → Nominatim (OpenStreetMap) place search
// Every result is cached by place key, so repeat locations (the same metros show up constantly in
// scraped inventory) cost one DB read, not a network call. Best-effort throughout: any failure
// returns null and never blocks the scraper pipeline. No external account, no cost.
//
// Nominatim usage policy: a valid User-Agent and ≤1 req/sec. We send a UA and the backfill paces
// live lookups; steady-state hits the cache, so the network burst is one-time.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceInput {
  zip?: string | null;
  city?: string | null;
  state?: string | null;
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  json: () => Promise<any>;
}>;

const NOMINATIM_UA = "DealerHuntPro/1.0 (vehicle deal geocoding)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ZIP_RE = /\b(\d{5})\b/;

/** Canonical cache key for a place. ZIP wins (most precise); else "city|state". Null if unusable. */
export function placeKey(p: PlaceInput): string | null {
  const zip = p.zip ? String(p.zip).match(ZIP_RE)?.[1] : null;
  if (zip) return `zip:${zip}`;
  const city = (p.city || "").trim().toLowerCase().replace(/\s+/g, " ");
  const state = (p.state || "").trim().toLowerCase();
  if (city && state) return `cs:${city}|${state}`;
  return null;
}

function validCoords(lat: any, lng: any): LatLng | null {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  if (la === 0 && lo === 0) return null; // null island — almost always a parse failure
  return { lat: la, lng: lo };
}

/** Parse api.zippopotam.us response → coords. */
export function parseZippopotam(body: any): LatLng | null {
  const place = body?.places?.[0];
  if (!place) return null;
  return validCoords(place.latitude, place.longitude);
}

/** Parse a Nominatim (OpenStreetMap) search response → coords. */
export function parseNominatim(body: any): LatLng | null {
  const hit = Array.isArray(body) ? body[0] : null;
  if (!hit) return null;
  return validCoords(hit.lat, hit.lon);
}

async function geocodeOnline(
  key: string,
  p: PlaceInput,
  fetchImpl: FetchLike,
): Promise<LatLng | null> {
  try {
    if (key.startsWith("zip:")) {
      const zip = key.slice(4);
      const res = await fetchImpl(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) return null;
      return parseZippopotam(await res.json());
    }
    const city = encodeURIComponent(String(p.city || ""));
    const state = encodeURIComponent(String(p.state || ""));
    const res = await fetchImpl(
      `https://nominatim.openstreetmap.org/search?city=${city}&state=${state}&country=US&format=json&limit=1`,
      { headers: { "User-Agent": NOMINATIM_UA } },
    );
    if (!res.ok) return null;
    return parseNominatim(await res.json());
  } catch {
    return null;
  }
}

/**
 * Resolve a SINGLE place (ZIP, or city/state) to coords — cache-first, one network call at most. The
 * building block for ZIP-driven "nearest listings" search in both apps.
 */
export async function geocodeZip(
  supabase: SupabaseClient,
  place: PlaceInput,
  opts: { fetchImpl?: FetchLike } = {},
): Promise<LatLng | null> {
  const k = placeKey(place);
  if (!k) return null;
  const map = await resolvePlaces(supabase, [place], {
    maxLookups: 1,
    fetchImpl: opts.fetchImpl,
  });
  return map.get(k) ?? null;
}

/**
 * Resolve many places to coords, hitting the cache first and the network only for misses.
 * @param maxLookups hard cap on network calls per batch (protects the scraper loop). Default 25.
 */
export async function resolvePlaces(
  supabase: SupabaseClient,
  places: PlaceInput[],
  opts: { maxLookups?: number; fetchImpl?: FetchLike; delayMs?: number } = {},
): Promise<Map<string, LatLng>> {
  const fetchImpl =
    opts.fetchImpl || (globalThis.fetch as unknown as FetchLike);
  const maxLookups = opts.maxLookups ?? 25;
  const delayMs = opts.delayMs ?? 0;
  const out = new Map<string, LatLng>();

  // Unique, usable keys.
  const keyToPlace = new Map<string, PlaceInput>();
  for (const p of places) {
    const k = placeKey(p);
    if (k && !keyToPlace.has(k)) keyToPlace.set(k, p);
  }
  if (keyToPlace.size === 0) return out;

  const keys = Array.from(keyToPlace.keys());

  // 1) Cache read. A row with source='failed' is a remembered miss — a place the geocoder couldn't
  //    resolve — so we don't retry it on every pass (protects the hot path and lets backfill converge).
  const failed = new Set<string>();
  try {
    const { data } = await supabase
      .from("geocode_cache")
      .select("place_key, lat, lng, source")
      .in("place_key", keys);
    for (const row of data || []) {
      if (row.source === "failed") {
        failed.add(row.place_key);
        continue;
      }
      const c = validCoords(row.lat, row.lng);
      if (c) out.set(row.place_key, c);
    }
  } catch {
    // Cache table missing → fall through to live lookups.
  }

  // 2) Live lookups for misses (excluding remembered failures), bounded.
  const misses = keys.filter((k) => !out.has(k) && !failed.has(k));
  const toFetch = misses.slice(0, maxLookups);
  const fresh: {
    place_key: string;
    lat: number;
    lng: number;
    source: string;
  }[] = [];

  for (let i = 0; i < toFetch.length; i++) {
    const k = toFetch[i];
    if (delayMs > 0 && i > 0) await sleep(delayMs);
    const coords = await geocodeOnline(k, keyToPlace.get(k)!, fetchImpl);
    if (coords) {
      out.set(k, coords);
      fresh.push({
        place_key: k,
        lat: coords.lat,
        lng: coords.lng,
        source: k.startsWith("zip:") ? "zippopotam" : "nominatim",
      });
    } else {
      // Remember the miss so we don't hammer the geocoder with it again.
      fresh.push({ place_key: k, lat: 0, lng: 0, source: "failed" });
    }
  }

  // 3) Write fresh results back to the cache (best-effort).
  if (fresh.length) {
    try {
      await supabase
        .from("geocode_cache")
        .upsert(fresh, { onConflict: "place_key", ignoreDuplicates: true });
    } catch {
      /* non-fatal */
    }
  }

  return out;
}

/** Single-place convenience wrapper. */
export async function geocodePlace(
  supabase: SupabaseClient,
  place: PlaceInput,
  opts: { fetchImpl?: FetchLike } = {},
): Promise<LatLng | null> {
  const k = placeKey(place);
  if (!k) return null;
  const map = await resolvePlaces(supabase, [place], {
    ...opts,
    maxLookups: 1,
  });
  return map.get(k) || null;
}
