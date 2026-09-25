// Great-circle distance helpers. Pure math, no I/O — used for saved-search radius matching and
// "deals near me" filtering once deals and the dealer's home are geocoded.

const EARTH_RADIUS_MILES = 3958.7613;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in miles between two lat/lng points. Returns null if any input is invalid. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number | null {
  for (const v of [lat1, lng1, lat2, lng2]) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
  }
  if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90) return null;
  if (Math.abs(lng1) > 180 || Math.abs(lng2) > 180) return null;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

/**
 * A lat/lng bounding box roughly `miles` around a point. Used as a cheap SQL pre-filter (lat/lng BETWEEN)
 * so a ZIP-radius search over a huge table only haversine-sorts a small candidate set, not the whole table.
 * Longitude degrees shrink with latitude (cos), so the box widens in lng toward the equator.
 */
export function boundingBox(
  lat: number,
  lng: number,
  miles: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = miles / 69; // ~69 miles per degree of latitude
  const lngDelta = miles / (69 * Math.max(0.05, Math.cos(toRad(lat))));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/** True when point B is within `miles` of point A. Missing/invalid coords → false (never matches). */
export function withinMiles(
  a: { lat?: number | null; lng?: number | null },
  b: { lat?: number | null; lng?: number | null },
  miles: number,
): boolean {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null)
    return false;
  const d = haversineMiles(
    Number(a.lat),
    Number(a.lng),
    Number(b.lat),
    Number(b.lng),
  );
  return d != null && d <= miles;
}
