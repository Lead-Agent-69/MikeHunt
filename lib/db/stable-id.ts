// lib/db/stable-id.ts
//
// One home for the deterministic string-hash that was copy-pasted across source connectors and map routes
// (lib/housing/sources/{redfin,portals}.ts, app/api/deals/map, app/api/homeiq/leads). A stable id derived
// from a listing's own URL/address lets upserts dedupe across runs without depending on the source's IDs.

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

/** Deterministic base36 id from any basis string, optionally namespaced by a source prefix. */
export function stableId(basis: string, prefix?: string): string {
  const id = (hash(basis) >>> 0).toString(36);
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Deterministic signed offset in [-amp, amp] from a seed + salt — used to spread map points that fall back
 * to a shared centroid so they don't stack on one marker. Same seed+salt always yields the same offset.
 */
export function hashJitter(seed: string, salt: number, amp = 0.4): number {
  return ((Math.abs(hash(seed) + salt * 7919) % 1000) / 1000 - 0.5) * (amp * 2);
}
