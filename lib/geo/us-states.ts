// lib/geo/us-states.ts
// Shared, client-safe US state reference for the location-first UX (the states picker, the deals
// scope, and the overview). code → [name, lat, lng] centroids power "detect my state" + "nearby states".

export const US_STATES: Record<string, [string, number, number]> = {
  AL: ["Alabama", 32.81, -86.79],
  AK: ["Alaska", 61.37, -152.4],
  AZ: ["Arizona", 33.73, -111.43],
  AR: ["Arkansas", 34.97, -92.37],
  CA: ["California", 36.12, -119.68],
  CO: ["Colorado", 39.06, -105.31],
  CT: ["Connecticut", 41.6, -72.76],
  DE: ["Delaware", 39.32, -75.51],
  FL: ["Florida", 27.77, -81.69],
  GA: ["Georgia", 33.04, -83.64],
  HI: ["Hawaii", 21.09, -157.5],
  ID: ["Idaho", 44.24, -114.48],
  IL: ["Illinois", 40.35, -88.99],
  IN: ["Indiana", 39.85, -86.26],
  IA: ["Iowa", 42.01, -93.21],
  KS: ["Kansas", 38.53, -96.73],
  KY: ["Kentucky", 37.67, -84.67],
  LA: ["Louisiana", 31.17, -91.87],
  ME: ["Maine", 44.69, -69.38],
  MD: ["Maryland", 39.06, -76.8],
  MA: ["Massachusetts", 42.23, -71.53],
  MI: ["Michigan", 43.33, -84.54],
  MN: ["Minnesota", 45.69, -93.9],
  MS: ["Mississippi", 32.74, -89.68],
  MO: ["Missouri", 38.46, -92.29],
  MT: ["Montana", 46.92, -110.45],
  NE: ["Nebraska", 41.13, -98.27],
  NV: ["Nevada", 38.31, -117.06],
  NH: ["New Hampshire", 43.45, -71.56],
  NJ: ["New Jersey", 40.3, -74.52],
  NM: ["New Mexico", 34.84, -106.25],
  NY: ["New York", 42.17, -74.95],
  NC: ["North Carolina", 35.63, -79.81],
  ND: ["North Dakota", 47.53, -99.78],
  OH: ["Ohio", 40.39, -82.76],
  OK: ["Oklahoma", 35.57, -96.93],
  OR: ["Oregon", 44.57, -122.07],
  PA: ["Pennsylvania", 40.59, -77.21],
  RI: ["Rhode Island", 41.68, -71.51],
  SC: ["South Carolina", 33.86, -80.95],
  SD: ["South Dakota", 44.3, -99.44],
  TN: ["Tennessee", 35.75, -86.69],
  TX: ["Texas", 31.05, -97.56],
  UT: ["Utah", 40.15, -111.86],
  VT: ["Vermont", 44.05, -72.71],
  VA: ["Virginia", 37.77, -78.17],
  WA: ["Washington", 47.38, -121.51],
  WV: ["West Virginia", 38.49, -80.95],
  WI: ["Wisconsin", 44.27, -89.62],
  WY: ["Wyoming", 42.76, -107.3],
  DC: ["D.C.", 38.9, -77.04],
};

export const stateName = (code: string): string => US_STATES[code]?.[0] || code;

/** The state whose centroid is closest to a lat/lng — for "detect my state" (free, no API). */
export function nearestState(lat: number, lng: number): string {
  let best = "MO",
    bestD = Infinity;
  for (const [code, [, sLat, sLng]] of Object.entries(US_STATES)) {
    const d = (lat - sLat) ** 2 + (lng - sLng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return best;
}

/** The n geographically-closest states to `code` (inclusive) — for the "nearby" scope widening. */
export function nearbyStates(code: string, n: number): Set<string> {
  const me = US_STATES[code];
  if (!me) return new Set([code]);
  return new Set(
    Object.keys(US_STATES)
      .map((c) => ({
        c,
        d: (US_STATES[c][1] - me[1]) ** 2 + (US_STATES[c][2] - me[2]) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map((x) => x.c),
  );
}
