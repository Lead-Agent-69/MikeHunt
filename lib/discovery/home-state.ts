import { sanitizeHomeLocation } from "@/lib/preferences/locations";

/**
 * Home state for Discover ranking. prefs.homeLocation (what Settings and onboarding save as
 * "where you live", sanitized) wins; the legacy user_profiles.home_state column is only a
 * fallback. Returns "" when neither is a real 2-letter state.
 */
export function discoverHomeState(
  prefsHomeLocation: unknown,
  profileHomeState: unknown,
): string {
  const home = sanitizeHomeLocation(prefsHomeLocation);
  if (home) return home.state;
  const legacy = String(profileHomeState || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(legacy) && legacy !== "NA" ? legacy : "";
}
