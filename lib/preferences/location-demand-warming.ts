/**
 * Client-safe location-demand warming helpers (no Node / Supabase imports).
 * Discover CoverageNotice reads prefs.locationDemand* stamped by the prefs/profile APIs.
 */

export const LOCATION_DEMAND_WARMING_MS = 2 * 60 * 60 * 1000;

type PrefsLike = {
  homeLocation?: unknown;
  searchLocations?: unknown;
  carsState?: unknown;
  carsStates?: unknown;
  buyerScope?: { state?: unknown } | null;
  locationDemandAt?: unknown;
  locationDemandStates?: unknown;
};

function cleanState(value: unknown): string | undefined {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/** Fallback states when locationDemandStates was not stamped. */
export function demandStatesFromPrefsLight(
  prefs: PrefsLike | null | undefined,
): string[] {
  if (!prefs) return [];
  const out = new Set<string>();
  const homeObj =
    prefs.homeLocation && typeof prefs.homeLocation === "object"
      ? (prefs.homeLocation as { state?: unknown })
      : null;
  const home =
    cleanState(homeObj?.state) ||
    cleanState(prefs.carsState) ||
    cleanState(prefs.buyerScope?.state);
  if (home) out.add(home);
  if (Array.isArray(prefs.searchLocations)) {
    for (const loc of prefs.searchLocations) {
      if (loc && typeof loc === "object") {
        const st = cleanState((loc as { state?: unknown }).state);
        if (st) out.add(st);
      }
    }
  }
  return Array.from(out).sort();
}

export function isLocationDemandWarming(
  prefs: PrefsLike | null | undefined,
  nowMs = Date.now(),
): {
  scanning: boolean;
  states: string[];
  demandedAt: string | null;
  ageMs: number | null;
} {
  const rawAt = prefs?.locationDemandAt;
  const at =
    typeof rawAt === "string" && rawAt.trim() ? Date.parse(rawAt) : NaN;
  const states = Array.isArray(prefs?.locationDemandStates)
    ? (prefs!.locationDemandStates as unknown[])
        .map((s) => cleanState(s))
        .filter((s): s is string => Boolean(s))
    : demandStatesFromPrefsLight(prefs);

  if (!Number.isFinite(at)) {
    return { scanning: false, states, demandedAt: null, ageMs: null };
  }
  const ageMs = nowMs - at;
  const scanning =
    ageMs >= 0 && ageMs < LOCATION_DEMAND_WARMING_MS && states.length > 0;
  return {
    scanning,
    states,
    demandedAt: new Date(at).toISOString(),
    ageMs,
  };
}
