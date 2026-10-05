// Onboarding's "Home state" step writes the home location (prefs.homeLocation) from #66, keeping the
// legacy carsState / carsStates mirrors for older readers. Search markets are never overwritten here.

import {
  cleanState,
  effectiveHome,
  effectiveSearchLocations,
  sanitizeHomeLocation,
  type HomeLocation,
} from "./locations";

type PrefsInput = Parameters<typeof effectiveHome>[0];

/** State to prefill: explicit homeLocation, then the saved intent state, then legacy fallbacks. */
export function onboardingHomeState(
  prefs: PrefsInput,
  savedIntentState?: string,
): string {
  const explicit = sanitizeHomeLocation(prefs?.homeLocation);
  if (explicit) return explicit.state;
  if (savedIntentState) return savedIntentState;
  return effectiveHome(prefs)?.state || "";
}

/** Prefs patch for the chosen home state. Nationwide / blank leaves location prefs alone. */
export function onboardingLocationPatch(
  state: string,
  prefs: PrefsInput,
): {
  homeLocation?: HomeLocation;
  carsState?: string;
  carsStates?: string[];
} {
  const code = cleanState(state);
  if (!code) return {};
  const previous = sanitizeHomeLocation(prefs?.homeLocation);
  // Same state as before: keep the saved city / ZIP / radius instead of wiping them.
  const homeLocation: HomeLocation =
    previous && previous.state === code
      ? (Object.fromEntries(
          Object.entries(previous).filter(([key]) => key !== "updatedAt"),
        ) as unknown as HomeLocation)
      : { state: code };
  const carsStates = [code];
  for (const loc of effectiveSearchLocations(prefs)) {
    if (!carsStates.includes(loc.state)) carsStates.push(loc.state);
  }
  return { homeLocation, carsState: code, carsStates };
}
