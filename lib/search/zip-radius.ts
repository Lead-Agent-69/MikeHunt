import type { SupabaseClient } from "@supabase/supabase-js";
import { boundingBox, haversineMiles } from "@/lib/geo/distance";
import { geocodeZip } from "@/lib/geo/geocode";

export const DEFAULT_RADIUS_MI = 100;
export const MAX_RADIUS_MI = 500;

export interface ZipRadius {
  zip: string;
  radius: number;
  lat: number;
  lng: number;
  box: ReturnType<typeof boundingBox>;
}

/** Parse ?zip=&radius= (radius clamped 5..500, default 100 when only a ZIP is given). */
export function parseZipRadius(
  params: URLSearchParams,
): { zip: string; radius: number } | null {
  const zip = (params.get("zip") || "").trim();
  if (!/^\d{5}$/.test(zip)) return null;
  const r = Number(params.get("radius"));
  const radius =
    Number.isFinite(r) && r > 0
      ? Math.min(MAX_RADIUS_MI, Math.max(5, Math.round(r)))
      : DEFAULT_RADIUS_MI;
  return { zip, radius };
}

/** Geocode the ZIP (cache-first, one lookup at most) and build the SQL pre-filter box. */
export async function resolveZipRadius(
  supabase: SupabaseClient,
  params: URLSearchParams,
  geocode: typeof geocodeZip = geocodeZip,
): Promise<ZipRadius | null> {
  const parsed = parseZipRadius(params);
  if (!parsed) return null;
  const c = await geocode(supabase, { zip: parsed.zip });
  if (!c) return null;
  return {
    ...parsed,
    lat: c.lat,
    lng: c.lng,
    box: boundingBox(c.lat, c.lng, parsed.radius),
  };
}

/** Narrow a PostgREST deals query to the box (rows without coordinates can't be placed, so they drop). */
export function applyZipRadiusBox<Q extends { not: any; gte: any; lte: any }>(
  query: Q,
  zr: ZipRadius,
): Q {
  return query
    .not("lat", "is", null)
    .gte("lat", zr.box.minLat)
    .lte("lat", zr.box.maxLat)
    .gte("lng", zr.box.minLng)
    .lte("lng", zr.box.maxLng);
}

/** Road-agnostic straight-line miles from the search center, rounded; null when the row has no coords. */
export function milesFrom(
  zr: ZipRadius,
  row: { lat?: unknown; lng?: unknown },
): number | null {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (
    row.lat == null ||
    row.lng == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  )
    return null;
  const d = haversineMiles(zr.lat, zr.lng, lat, lng);
  return d == null ? null : Math.round(d);
}
