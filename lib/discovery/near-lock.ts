import { zipToState } from "@/lib/geo/zip-state";
import { sanitizeHomeLocation } from "@/lib/preferences/locations";

export interface NearQueryLockInput {
  zip?: string | null;
  /** Raw user_preferences.prefs.homeLocation — sanitized here; wins over the profile columns. */
  prefsHomeLocation?: unknown;
  radiusParam?: string | null;
  homeState?: string | null;
  homeZip?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
}

export interface NearQueryLock {
  state: string | null;
  /** Where the lock came from (query ZIP, saved prefs home, legacy profile, or none). */
  from?: "zip" | "prefs" | "profile" | null;
  /** Saved prefs home ZIP, when the lock came from prefs and it had one (for the distance center). */
  homeZip?: string;
  /** Explicit miles only. Never a default 150. 0 means no mile cap. */
  radius: number;
}

function stateCode(value: unknown): string | null {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * State lock for /api/deals/near.
 * A query ZIP's state wins. Then prefs.homeLocation (Settings/onboarding "where you live",
 * sanitized). Then the legacy profile home ZIP, then home_state.
 * The untouched CA column default (no pin, no home ZIP) is not a lock.
 * Radius is whatever the caller passed. This function never invents 150.
 */
export function nearQueryLock(input: NearQueryLockInput): NearQueryLock {
  const zip = String(input.zip || "").trim();
  if (zip) {
    const fromZip = zipToState(zip);
    return {
      state: fromZip,
      radius: explicitRadius(input.radiusParam, Boolean(fromZip)),
      from: fromZip ? "zip" : null,
    };
  }

  const prefsHome = sanitizeHomeLocation(input.prefsHomeLocation);
  if (prefsHome) {
    const fromPrefsZip = prefsHome.zip ? zipToState(prefsHome.zip) : null;
    // A ZIP that disagrees with the chosen state is ignored; the state the user picked wins.
    const zipAgrees = fromPrefsZip === prefsHome.state;
    return {
      state: prefsHome.state,
      radius:
        input.radiusParam == null
          ? (prefsHome.radiusMi ?? 0)
          : explicitRadius(input.radiusParam, true),
      from: "prefs",
      ...(zipAgrees && prefsHome.zip ? { homeZip: prefsHome.zip } : {}),
    };
  }

  const fromHomeZip = input.homeZip ? zipToState(String(input.homeZip)) : null;
  const homeState = stateCode(input.homeState);
  const hasPin = input.homeLat != null && input.homeLng != null;
  const untouchedCaDefault = homeState === "CA" && !fromHomeZip && !hasPin;
  const state =
    fromHomeZip || (homeState && !untouchedCaDefault ? homeState : null);
  return {
    state,
    radius: explicitRadius(input.radiusParam, Boolean(state)),
    from: state ? "profile" : null,
  };
}

function explicitRadius(
  radiusParam: string | null | undefined,
  hasState: boolean,
) {
  if (!hasState) return 0;
  const requested = Number(radiusParam);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return requested;
}
