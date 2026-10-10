// Freshness of the per-VIN safety/EPA extras cached on vin_decodes (/api/vin/[vin]/specs).
//
//   complete (safety stars AND MPG present)  -> fresh 180 days, then BOTH are looked up again
//   incomplete, attempts < 3                 -> retried after 6h (only the missing ones)
//   incomplete, attempts >= 3                -> settled as "n/a" for 180 days (typically heavy-duty
//                                               trucks: EPA doesn't rate > 8,500 lb GVWR and NHTSA
//                                               doesn't crash-test them), then a new cycle starts
// extras_attempts lives on vin_decodes (20261010401000). Without that column, attempts read as 0, so
// behaviour falls back to the 6h retry.

/** Safety stars + EPA MPG, once found, are kept 180 days. */
export const EXTRAS_TTL_MS = 180 * 24 * 3_600_000;
/** If either lookup came back empty, retry after 6h instead of pinning the gap (Ren #301 nit). */
export const EXTRAS_RETRY_MS = 6 * 3_600_000;
/** Incomplete attempts before the missing values are settled as "n/a" (Ren #330 nit). */
export const EXTRAS_MAX_ATTEMPTS = 3;
/** GVWR above which EPA publishes no MPG and NHTSA no crash ratings. */
export const HEAVY_DUTY_GVWR_LB = 8_500;

export type ExtraStatus = "ok" | "pending" | "n/a";

const attemptsOf = (row: any) => {
  const n = Number(row?.extras_attempts);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function extrasComplete(row: any): boolean {
  return row?.safety_overall != null && row?.mpg_combined != null;
}

/** Incomplete, but out of retries: the missing values are reported as "n/a". */
export function extrasSettled(row: any): boolean {
  return !extrasComplete(row) && attemptsOf(row) >= EXTRAS_MAX_ATTEMPTS;
}

/** Whether the row's safety/EPA extras are still fresh (see the table above). */
export function extrasFresh(row: any, now: number = Date.now()): boolean {
  if (!row?.extras_at) return false;
  const age = now - new Date(row.extras_at).getTime();
  if (!Number.isFinite(age)) return false;
  return (
    age <
    (extrasComplete(row) || extrasSettled(row)
      ? EXTRAS_TTL_MS
      : EXTRAS_RETRY_MS)
  );
}

export interface ExtrasPlan {
  /** Look up crash ratings this request. */
  safety: boolean;
  /** Look up EPA MPG this request. */
  mpg: boolean;
  /** extras_attempts to store if the lookups run. */
  nextAttempts: number;
}

/** Which lookups to run for a row that isn't fresh. A stale complete or settled row starts over. */
export function planExtras(row: any, now: number = Date.now()): ExtrasPlan {
  if (extrasFresh(row, now))
    return { safety: false, mpg: false, nextAttempts: attemptsOf(row) };
  const restart = !row?.extras_at || extrasComplete(row) || extrasSettled(row);
  return {
    safety: restart || row?.safety_overall == null,
    mpg: restart || row?.mpg_combined == null,
    nextAttempts: restart ? 1 : attemptsOf(row) + 1,
  };
}

/** Per-field status for the API response. */
export function extrasStatus(row: any): {
  safety: ExtraStatus;
  mpg: ExtraStatus;
  heavyDuty: boolean;
} {
  const settled = attemptsOf(row) >= EXTRAS_MAX_ATTEMPTS;
  const s = (v: unknown): ExtraStatus =>
    v != null ? "ok" : settled ? "n/a" : "pending";
  return {
    safety: s(row?.safety_overall),
    mpg: s(row?.mpg_combined),
    heavyDuty: Number(row?.gvwr_max_lb) > HEAVY_DUTY_GVWR_LB,
  };
}
