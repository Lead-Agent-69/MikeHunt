// lib/geo/buyer-home.ts
// The buyer's home as a GeoPoint for lib/geo/buyer-distance and analyzeDeal({ home }).
//
// Evidence order (never a default state):
//   1. prefs.homeLocation (Settings / onboarding "where you live", sanitized): state, plus its ZIP
//      when the ZIP agrees with that state. Coords come from prefs.homeLocation lat/lng when present,
//      else the profile pin, but ONLY when the pin's profile state matches (never measure from an old
//      home in another state, same rule as /api/deals/near).
//   2. Legacy user_profiles columns: home ZIP's state, else home_state. The untouched "CA" column
//      default (no ZIP, no pin) is NOT a home.
//   3. Nothing → null. Callers treat null as unknown distance; they must not substitute TX/CA.
//
// Pure, no I/O. Callers reuse rows they already fetched (no per-listing queries).

import type { GeoPoint } from "./buyer-distance";
import { zipToState } from "./zip-state";
import {
  effectiveHome,
  sanitizeHomeLocation,
} from "@/lib/preferences/locations";

export interface BuyerHome extends GeoPoint {
  state: string;
  /** Where the home came from. */
  from: "prefs" | "profile";
}

export interface BuyerHomeProfile {
  home_state?: unknown;
  home_zip?: unknown;
  home_lat?: unknown;
  home_lng?: unknown;
}

function stateCode(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(s) && s !== "NA" ? s : null;
}

function zipCode(v: unknown): string | null {
  const z = String(v ?? "").trim();
  return /^\d{5}$/.test(z) ? z : null;
}

/** Real lat/lng pair, or null. Null island and out-of-range values are not a location. */
export function validCoords(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0 && b === 0) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

function withOptional(
  base: BuyerHome,
  zip: string | null,
  coords: { lat: number; lng: number } | null,
): BuyerHome {
  return {
    ...base,
    ...(zip ? { zip } : {}),
    ...(coords ? coords : {}),
  };
}

/** Resolve the buyer's home from saved prefs and (optionally) the already-fetched profile row. */
export function resolveBuyerHome(input: {
  prefsHomeLocation?: unknown;
  profile?: BuyerHomeProfile | null;
}): BuyerHome | null {
  const profile = input.profile || null;
  const pin = profile ? validCoords(profile.home_lat, profile.home_lng) : null;
  const profileState = stateCode(profile?.home_state);

  const prefsHome = sanitizeHomeLocation(input.prefsHomeLocation);
  if (prefsHome) {
    const state = prefsHome.state;
    const zip =
      prefsHome.zip && zipToState(prefsHome.zip) === state
        ? prefsHome.zip
        : null;
    const raw = input.prefsHomeLocation as
      | { lat?: unknown; lng?: unknown }
      | null
      | undefined;
    const prefsCoords = raw ? validCoords(raw.lat, raw.lng) : null;
    const coords = prefsCoords ?? (pin && profileState === state ? pin : null);
    return withOptional({ state, from: "prefs" }, zip, coords);
  }

  if (!profile) return null;
  const zip = zipCode(profile.home_zip);
  const zipState = zip ? zipToState(zip) : null;
  const untouchedCaDefault = profileState === "CA" && !zipState && !pin;
  const state = zipState || (untouchedCaDefault ? null : profileState);
  if (!state) return null;
  const coords = pin && (!profileState || profileState === state) ? pin : null;
  return withOptional(
    { state, from: "profile" },
    zipState ? zip : null,
    coords,
  );
}

/**
 * Home from a saved prefs blob alone (routes that read prefs but not the profile row). Uses
 * effectiveHome so legacy carsState / buyerScope.state still count as a chosen home state.
 */
export function buyerHomeFromPrefs(
  prefs: Parameters<typeof effectiveHome>[0],
): BuyerHome | null {
  const fromHomeLocation = resolveBuyerHome({
    prefsHomeLocation: (prefs as { homeLocation?: unknown } | null)
      ?.homeLocation,
  });
  if (fromHomeLocation) return fromHomeLocation;
  const legacy = effectiveHome(prefs);
  return legacy?.state ? { state: legacy.state, from: "prefs" } : null;
}
