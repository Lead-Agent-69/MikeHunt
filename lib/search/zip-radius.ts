import type { SupabaseClient } from "@supabase/supabase-js";
import { boundingBox, haversineMiles } from "@/lib/geo/distance";
import { geocodeZip } from "@/lib/geo/geocode";
import { parseZipRadius } from "./zip-radius-scope";
export {
  parseZipRadius,
  DEFAULT_RADIUS_MI,
  MAX_RADIUS_MI,
} from "./zip-radius-scope";

export interface ZipRadius {
  zip: string;
  radius: number;
  lat: number;
  lng: number;
  box: ReturnType<typeof boundingBox>;
}

export const ZIP_LOOKUP_ERROR =
  "We couldn't locate that ZIP code. Check it and try again; your search has not been broadened.";

/** Test the circle before redacting coordinates; SQL only narrows to its bounding box. */
export function filterZipRadiusRows<T extends { lat?: unknown; lng?: unknown }>(
  rows: T[],
  zr: ZipRadius | null,
): T[] {
  if (!zr) return rows;
  return rows.filter((row) => {
    if (row.lat == null || row.lng == null) return false;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    const distance = haversineMiles(zr.lat, zr.lng, lat, lng);
    return distance != null && distance <= zr.radius;
  });
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
