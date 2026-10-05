// Home vs search locations. Home = where the user lives (signup / profile). Search locations =
// markets the user adds on purpose. They stay separate so the scraper can weight them differently
// (home 3x, search 2x) and ranking can add travel/shipping only for search markets.
// See docs/USER-DRIVEN-SCRAPING.md §3–4.

export const LOCATION_STATES = new Set<string>([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

export const MAX_SEARCH_LOCATIONS = 10;
export const MIN_RADIUS_MI = 25;
export const MAX_RADIUS_MI = 500;
const MAX_CITY = 60;
const MAX_LABEL = 40;

export interface HomeLocation {
  state: string;
  city?: string;
  zip?: string;
  radiusMi?: number;
  updatedAt?: string;
}

export interface SearchLocation {
  id: string;
  state: string;
  city?: string;
  zip?: string;
  radiusMi?: number;
  label?: string;
  addedAt: string;
}

export function cleanState(value: unknown): string | undefined {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return LOCATION_STATES.has(code) ? code : undefined;
}

function cleanZip(value: unknown): string | undefined {
  const zip =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number"
        ? String(value)
        : "";
  return /^\d{5}$/.test(zip) ? zip : undefined;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : undefined;
}

function cleanRadius(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, n)));
}

function cleanIso(value: unknown, fallback: string): string {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

export function sanitizeHomeLocation(
  value: unknown,
  now = new Date().toISOString(),
): HomeLocation | null | undefined {
  if (value === null) return null; // explicit clear
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const v = value as Record<string, unknown>;
  const state = cleanState(v.state);
  if (!state) return undefined;
  return compact({
    state,
    city: cleanText(v.city, MAX_CITY),
    zip: cleanZip(v.zip),
    radiusMi: cleanRadius(v.radiusMi),
    updatedAt: now,
  });
}

export function sanitizeSearchLocations(
  value: unknown,
  now = new Date().toISOString(),
): SearchLocation[] | undefined {
  if (value === null) return [];
  if (!Array.isArray(value)) return undefined;
  const out: SearchLocation[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const v = item as Record<string, unknown>;
    const state = cleanState(v.state);
    if (!state) continue;
    const zip = cleanZip(v.zip);
    const key = `${state}|${zip || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      compact({
        id: cleanText(v.id, 64) || key,
        state,
        city: cleanText(v.city, MAX_CITY),
        zip,
        radiusMi: cleanRadius(v.radiusMi),
        label: cleanText(v.label, MAX_LABEL),
        addedAt: cleanIso(v.addedAt, now),
      }),
    );
    if (out.length >= MAX_SEARCH_LOCATIONS) break;
  }
  return out;
}

/**
 * Validate homeLocation / searchLocations in a prefs PUT patch. Invalid shapes are rejected (400)
 * rather than silently stored, so the scraper's demand reader can trust what it finds.
 */
export function sanitizeLocationPatch(
  patch: Record<string, unknown>,
  now = new Date().toISOString(),
): { patch: Record<string, unknown> } | { error: string } {
  const next = { ...patch };
  if ("homeLocation" in patch) {
    const home = sanitizeHomeLocation(patch.homeLocation, now);
    if (home === undefined)
      return { error: "homeLocation needs a valid US state" };
    next.homeLocation = home;
  }
  if ("searchLocations" in patch) {
    const list = sanitizeSearchLocations(patch.searchLocations, now);
    if (list === undefined) return { error: "searchLocations must be a list" };
    next.searchLocations = list;
  }
  return { patch: next };
}

interface PrefsLike {
  homeLocation?: unknown;
  searchLocations?: unknown;
  carsState?: unknown;
  carsStates?: unknown;
  buyerScope?: { state?: unknown } | null;
}

/** Home location, falling back to legacy carsState, then buyerScope.state. */
export function effectiveHome(
  prefs: PrefsLike | null | undefined,
): HomeLocation | undefined {
  if (!prefs) return undefined;
  const home = sanitizeHomeLocation(prefs.homeLocation);
  if (home) return home;
  const legacy =
    cleanState(prefs.carsState) || cleanState(prefs.buyerScope?.state);
  return legacy ? { state: legacy } : undefined;
}

/** Search locations, falling back to legacy carsStates[]. Never repeats the home state alone. */
export function effectiveSearchLocations(
  prefs: PrefsLike | null | undefined,
): SearchLocation[] {
  if (!prefs) return [];
  if (Array.isArray(prefs.searchLocations))
    return sanitizeSearchLocations(prefs.searchLocations) || [];
  const home = effectiveHome(prefs)?.state;
  const legacy = Array.isArray(prefs.carsStates) ? prefs.carsStates : [];
  return (
    sanitizeSearchLocations(
      legacy.map((state) => ({ state })),
      "1970-01-01T00:00:00.000Z",
    ) || []
  ).filter((loc) => loc.state !== home);
}
