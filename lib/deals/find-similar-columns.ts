// Column allowlist for /api/find-similar (public, anonymous-callable).
// Matches what components/saved/FindSimilarModal.tsx renders. Never select("*") here: the deals row
// carries the raw pgvector `embedding`, exact lat/lng/location_zip and pricing_breakdown, none of
// which a comparables list needs. Location is city/state only. profit_score / profit_estimate are
// selected for the flip desk and stripped by listingsForDesk for everyone else.
export const FIND_SIMILAR_COLUMNS = [
  "id",
  "source",
  "title",
  "year",
  "make",
  "model",
  "trim",
  "mileage",
  "condition",
  "ask_price",
  "images",
  "location_city",
  "location_state",
  "profit_score",
  "profit_estimate",
] as const;

export const FIND_SIMILAR_SELECT = FIND_SIMILAR_COLUMNS.join(", ");

/** Copy only allowlisted keys (defense in depth if the query or a mock returns extra columns). */
export function pickFindSimilarColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FIND_SIMILAR_COLUMNS) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

/** Per-caller listing payloads: never cache in a shared CDN/proxy. */
export const NO_STORE = "private, no-store";

export function withNoStore<T extends Response>(res: T): T {
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}

/** Coarsen a coordinate to 2 decimals (~1 km) so public payloads never carry a source-exact point. */
export function coarseCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Longest make / model we accept on /api/find-similar (real values are well under this). */
export const FIND_SIMILAR_MAX_TERM = 64;

/**
 * Escape a user term for a Postgres (I)LIKE pattern so it matches literally: backslash, % and _
 * are escaped, and PostgREST's `*` wildcard alias is dropped.
 */
export function escapeLike(term: string): string {
  return term
    .replace(/\*/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, (c) => `\\${c}`);
}
