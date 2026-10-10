// UI helpers for the home vs search location prefs (schema + sanitizer live in ./locations).
// Settings, onboarding and the nav state chip build patches through these so every surface writes
// the same shape and keeps the legacy carsState / carsStates mirrors in sync for older readers.

import {
  MAX_RADIUS_MI,
  MAX_SEARCH_LOCATIONS,
  MIN_RADIUS_MI,
  cleanState,
  effectiveHome,
  effectiveSearchLocations,
  type HomeLocation,
  type SearchLocation,
} from "./locations";
import { zipToState } from "@/lib/geo/zip-state";

export const RADIUS_OPTIONS_MI = [25, 50, 100, 250, 500] as const;

export interface LocationFormInput {
  state: string;
  city?: string;
  zip?: string;
  radiusMi?: number | string;
}

function formZip(zip?: string): string | undefined | null {
  const z = (zip || "").trim();
  if (!z) return undefined;
  return /^\d{5}$/.test(z) ? z : null; // null = invalid
}

function formRadius(value?: number | string): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, n)));
}

function formCity(city?: string): string | undefined {
  const c = (city || "").replace(/\s+/g, " ").trim();
  return c ? c.slice(0, 60) : undefined;
}

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/** Build a homeLocation from the form, or an error message for the user. */
export function homeLocationFromForm(
  input: LocationFormInput,
): { home: HomeLocation } | { error: string } {
  const state = cleanState(input.state);
  if (!state) return { error: "Choose your home state." };
  const zip = formZip(input.zip);
  if (zip === null) return { error: "ZIP must be 5 digits." };
  if (zip && zipToState(zip) && zipToState(zip) !== state)
    return { error: "ZIP does not match the selected state." };
  return {
    home: compact({
      state,
      city: formCity(input.city),
      zip,
      radiusMi: formRadius(input.radiusMi),
    }),
  };
}

export function searchLocationKey(loc: { state: string; zip?: string }) {
  return `${loc.state}|${loc.zip || ""}`;
}

/** Append a search market, rejecting duplicates, the bare home state, and the 10-market cap. */
export function addSearchLocation(
  list: SearchLocation[],
  input: LocationFormInput,
  home?: HomeLocation | null,
  now = new Date().toISOString(),
): { list: SearchLocation[] } | { error: string } {
  const state = cleanState(input.state);
  if (!state) return { error: "Choose a state to search." };
  const zip = formZip(input.zip);
  if (zip === null) return { error: "ZIP must be 5 digits." };
  if (list.length >= MAX_SEARCH_LOCATIONS)
    return {
      error: `You can save up to ${MAX_SEARCH_LOCATIONS} search markets.`,
    };
  if (home?.state === state && !zip && !home.zip)
    return { error: `${state} is already your home state.` };
  const key = searchLocationKey({ state, zip });
  if (list.some((loc) => searchLocationKey(loc) === key))
    return { error: "That market is already on your list." };
  return {
    list: [
      ...list,
      compact({
        id: key,
        state,
        city: formCity(input.city),
        zip,
        radiusMi: formRadius(input.radiusMi),
        addedAt: now,
      }),
    ],
  };
}

export function removeSearchLocation(
  list: SearchLocation[],
  id: string,
): SearchLocation[] {
  return list.filter((loc) => loc.id !== id);
}

/** Legacy carsStates mirror: home state first, then each search state once. */
export function legacyStatesMirror(
  home: HomeLocation | null | undefined,
  search: SearchLocation[],
): string[] {
  const out: string[] = [];
  for (const state of [home?.state, ...search.map((loc) => loc.state)]) {
    if (state && !out.includes(state)) out.push(state);
  }
  return out;
}

/** Patch for saving the home location (null clears it). */
export function homeLocationPatch(
  home: HomeLocation | null,
  search: SearchLocation[],
) {
  return {
    homeLocation: home,
    carsState: home?.state || "",
    carsStates: legacyStatesMirror(home, search),
  };
}

/** Patch for saving the search markets list. */
export function searchLocationsPatch(
  home: HomeLocation | null | undefined,
  search: SearchLocation[],
) {
  return {
    searchLocations: search,
    carsStates: legacyStatesMirror(home, search),
  };
}

/** Short human label: "Austin, TX 78701 · 100 mi". */
export function locationLabel(loc: {
  state: string;
  city?: string;
  zip?: string;
  radiusMi?: number;
  label?: string;
}): string {
  const place = [loc.city ? `${loc.city}, ${loc.state}` : loc.state, loc.zip]
    .filter(Boolean)
    .join(" ");
  const name = loc.label ? `${loc.label} (${place})` : place;
  return loc.radiusMi ? `${name} · ${loc.radiusMi} mi` : name;
}

/**
 * Map a state list picked in the nav chip (StatePicker) onto search markets: the home state is not a
 * search market, saved entries (ZIP / radius) survive for states still picked, and newly picked
 * states become bare whole-state markets. Capped at MAX_SEARCH_LOCATIONS.
 */
export function searchLocationsFromStates(
  states: string[],
  home: HomeLocation | null | undefined,
  existing: SearchLocation[],
  now = new Date().toISOString(),
): SearchLocation[] {
  const picked = states
    .map((s) => cleanState(s))
    .filter((s): s is string => Boolean(s));
  const kept = existing.filter((loc) => picked.includes(loc.state));
  const out = [...kept];
  for (const state of picked) {
    if (state === home?.state) continue;
    if (out.some((loc) => loc.state === state)) continue;
    out.push({ id: searchLocationKey({ state }), state, addedAt: now });
  }
  return out.slice(0, MAX_SEARCH_LOCATIONS);
}

type ScopePrefs = Parameters<typeof effectiveHome>[0] & {
  carsStates?: unknown;
};

/**
 * Saved state scope for "which states am I looking at" readers (nav chip, feed, Discover):
 * the carsStates mirror first (it also records an explicit "All states" = []), then the #66
 * home + search locations for prefs written without the mirror. undefined = nothing saved.
 */
export function savedScopeStates(
  prefs: ScopePrefs | null | undefined,
): string[] | undefined {
  if (!prefs) return undefined;
  if (Array.isArray(prefs.carsStates))
    return prefs.carsStates.filter((s): s is string => typeof s === "string");
  const hasLocationPrefs =
    prefs.homeLocation != null || Array.isArray(prefs.searchLocations);
  return hasLocationPrefs
    ? legacyStatesMirror(effectiveHome(prefs), effectiveSearchLocations(prefs))
    : undefined;
}
