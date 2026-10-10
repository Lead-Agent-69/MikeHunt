// Freshness of the per-VIN safety/EPA extras cached on vin_decodes (/api/vin/[vin]/specs).

/** Safety stars + EPA MPG, once found, are kept 180 days. */
export const EXTRAS_TTL_MS = 180 * 24 * 3_600_000;
/** If either lookup came back empty (failed, timed out, or NHTSA/EPA has nothing), retry after 6h
 *  instead of pinning the gap for 180 days (Ren #301 nit). */
export const EXTRAS_RETRY_MS = 6 * 3_600_000;

/** Whether the row's safety/EPA extras are still fresh: 180 days when both are present, else 6h. */
export function extrasFresh(row: any, now: number = Date.now()): boolean {
  if (!row?.extras_at) return false;
  const age = now - new Date(row.extras_at).getTime();
  if (!Number.isFinite(age)) return false;
  const complete = row.safety_overall != null && row.mpg_combined != null;
  return age < (complete ? EXTRAS_TTL_MS : EXTRAS_RETRY_MS);
}
