// lib/deals/similar-prefilters.ts
// Hard prefilters for "Similar deals". Pure vector similarity let a Ford Explorer match a Tesla
// Model S and a Honda Civic at 81–84%, so every candidate must first pass:
//   1. same segment (segmentOf: truck / suv / van / ev / sedan / coupe / convertible) — NEVER dropped,
//   2. a price band around the source ask (skipped when the source ask is unknown),
//   3. a model-year window (skipped when the source year is unknown),
// and only the survivors are ranked by embedding similarity. When too few survive, the band and
// window widen in a fixed order (price first, then year). If the widest tier is still thin we
// return fewer cards rather than cross-segment junk. Similarity numbers come only from pgvector.

import { segmentOf, type Segment } from "@/lib/discovery/categorize";

export const SIMILAR_MAX_RESULTS = 12;
/** Below this many survivors the next (wider) tier is tried. */
export const SIMILAR_MIN_RESULTS = 4;

export type SimilarTierStep = "strict" | "price-wide" | "price-off" | "year-wide";
export type SimilarTier = {
  step: SimilarTierStep;
  /** Fraction of the source ask (0.4 = ±40%); null = no price band. */
  priceBand: number | null;
  /** ± model years. */
  yearWindow: number;
};

/** Widening order: price band first (±40% → ±75% → off), then year (±3 → ±6). Segment never relaxes. */
export const SIMILAR_WIDEN_TIERS: readonly SimilarTier[] = [
  { step: "strict", priceBand: 0.4, yearWindow: 3 },
  { step: "price-wide", priceBand: 0.75, yearWindow: 3 },
  { step: "price-off", priceBand: null, yearWindow: 3 },
  { step: "year-wide", priceBand: null, yearWindow: 6 },
];

export type SimilarSource = {
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  ask_price?: number | string | null;
};

export type SimilarCandidate = SimilarSource & { id: string };

export type SimilarBounds = {
  minPrice: number | null;
  maxPrice: number | null;
  minYear: number | null;
  maxYear: number | null;
};

/** A real, positive ask — 0 / null / NaN means "unknown", never a $0 car. */
export function knownPrice(value: unknown): number | null {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

export function knownYear(value: unknown): number | null {
  const n = Number(value);
  return value != null && value !== "" && Number.isInteger(n) && n >= 1900 && n <= 2100
    ? n
    : null;
}

export function similarSegment(row: SimilarSource): Segment {
  return segmentOf(row.make, row.model);
}

export function boundsFor(source: SimilarSource, tier: SimilarTier): SimilarBounds {
  const price = knownPrice(source.ask_price);
  const year = knownYear(source.year);
  const band = price != null && tier.priceBand != null ? tier.priceBand : null;
  return {
    minPrice: band != null ? Math.floor(price! * (1 - band)) : null,
    maxPrice: band != null ? Math.ceil(price! * (1 + band)) : null,
    minYear: year != null ? year - tier.yearWindow : null,
    maxYear: year != null ? year + tier.yearWindow : null,
  };
}

/** Hard gate: same segment, inside the price band and year window (when those are known). */
export function matchesSimilarFilters(
  source: SimilarSource,
  candidate: SimilarSource,
  bounds: SimilarBounds,
): boolean {
  if (similarSegment(candidate) !== similarSegment(source)) return false;
  if (bounds.minPrice != null || bounds.maxPrice != null) {
    const p = knownPrice(candidate.ask_price);
    if (p == null) return false;
    if (bounds.minPrice != null && p < bounds.minPrice) return false;
    if (bounds.maxPrice != null && p > bounds.maxPrice) return false;
  }
  if (bounds.minYear != null || bounds.maxYear != null) {
    const y = knownYear(candidate.year);
    if (y == null) return false;
    if (bounds.minYear != null && y < bounds.minYear) return false;
    if (bounds.maxYear != null && y > bounds.maxYear) return false;
  }
  return true;
}

export type WidenResult<T> = {
  rows: T[];
  /** Widest tier actually used; null when nothing could be queried. */
  step: SimilarTierStep | null;
  /** True when a tier fetch failed (the caller decides whether to fall back). */
  failed: boolean;
};

/**
 * Walk SIMILAR_WIDEN_TIERS: fetch each tier's candidates (already prefiltered or not — the hard
 * gate is re-applied here so the segment rule holds regardless of the fetcher), keep tighter-tier
 * matches first, and stop once SIMILAR_MIN_RESULTS survive. Order inside a tier is the fetcher's
 * (semantic: nearest embedding first).
 */
export async function selectWithWidening<T extends SimilarCandidate>(
  source: SimilarSource,
  fetchTier: (bounds: SimilarBounds, tier: SimilarTier) => Promise<T[] | null>,
  opts: { min?: number; max?: number; excludeId?: string } = {},
): Promise<WidenResult<T>> {
  const min = opts.min ?? SIMILAR_MIN_RESULTS;
  const max = opts.max ?? SIMILAR_MAX_RESULTS;
  const out: T[] = [];
  const seen = new Set<string>(opts.excludeId ? [opts.excludeId] : []);
  let step: SimilarTierStep | null = null;
  let prev = "";
  for (const tier of SIMILAR_WIDEN_TIERS) {
    const bounds = boundsFor(source, tier);
    // Unknown price/year makes some tiers identical — don't re-query the same window.
    const key = JSON.stringify(bounds);
    if (key === prev) continue;
    prev = key;
    const rows = await fetchTier(bounds, tier);
    if (rows == null) return { rows: out.slice(0, max), step, failed: true };
    step = tier.step;
    for (const row of rows) {
      if (seen.has(row.id) || !matchesSimilarFilters(source, row, bounds)) continue;
      seen.add(row.id);
      out.push(row);
    }
    if (out.length >= min) break;
  }
  return { rows: out.slice(0, max), step, failed: false };
}
