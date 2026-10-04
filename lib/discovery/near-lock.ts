import { zipToState } from "@/lib/geo/zip-state";

export interface NearQueryLockInput {
  zip?: string | null;
  radiusParam?: string | null;
  homeState?: string | null;
  homeZip?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
}

export interface NearQueryLock {
  state: string | null;
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
 * A ZIP's state wins. Otherwise the saved home ZIP, then home_state.
 * The untouched CA column default (no pin, no home ZIP) is not a lock.
 * Radius is whatever the caller passed. This function never invents 150.
 */
export function nearQueryLock(input: NearQueryLockInput): NearQueryLock {
  const zip = String(input.zip || "").trim();
  if (zip) {
    const fromZip = zipToState(zip);
    return { state: fromZip, radius: explicitRadius(input.radiusParam, Boolean(fromZip)) };
  }

  const fromHomeZip = input.homeZip ? zipToState(String(input.homeZip)) : null;
  const homeState = stateCode(input.homeState);
  const hasPin = input.homeLat != null && input.homeLng != null;
  const untouchedCaDefault = homeState === "CA" && !fromHomeZip && !hasPin;
  const state =
    fromHomeZip || (homeState && !untouchedCaDefault ? homeState : null);
  return { state, radius: explicitRadius(input.radiusParam, Boolean(state)) };
}

function explicitRadius(radiusParam: string | null | undefined, hasState: boolean) {
  if (!hasState) return 0;
  const requested = Number(radiusParam);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return requested;
}
