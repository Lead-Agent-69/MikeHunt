// lib/valuation/comp-recency.ts
// Comp recency weighting for aggregateComps (opt-in via AggregateOptions.recency):
//   • time-decayed weights: w = 0.5 ^ (ageDays / halfLifeDays)
//   • bring each old comp to "today" before taking the median:
//       adjusted = price × (1 − depreciationPerMonth)^months × (1 + inflationPerMonth)^months
//   • weighted median (equal weights reproduce the ordinary median exactly)
// No runtime fetches. depreciationPerMonth can be estimated from our own comps
// (estimateMonthlyDepreciation) or passed in. inflationPerMonth is a configurable constant with
// default 0: set it from the BLS CPI "Used cars and trucks" series (CUSR0000SETA02) month-over-month
// change if you want it, and say so in the assumptions. We ship no hard-coded CPI number.

export interface RecencyOptions {
  /** Half-life of a comp's weight, in days. Required to turn weighting on. */
  halfLifeDays: number;
  /** Monthly depreciation of a fixed car, e.g. 0.012 = 1.2%/month. Default 0 (none). */
  depreciationPerMonth?: number;
  /** Monthly used-vehicle price index change. Default 0 (none). See header. */
  inflationPerMonth?: number;
  /** Age (days) assumed for comps without observedAt, for weighting only. Default halfLifeDays. */
  undatedAgeDays?: number;
}

/** Days per average month (365.25 / 12). */
export const DAYS_PER_MONTH = 30.4375;
/** Default and documented in docs/valuation/comp-recency.md: no CPI adjustment unless configured. */
export const DEFAULT_INFLATION_PER_MONTH = 0;

export interface WeightedPoint {
  value: number;
  weight: number;
}

/**
 * Weighted median. Sort by value; the median is where cumulative weight crosses half the total.
 * When it lands exactly on a boundary, average the two neighbours, so equal weights give the same
 * answer as the ordinary median (odd and even n).
 */
export function weightedMedian(
  points: readonly WeightedPoint[],
): number | null {
  const pts = points
    .filter((p) => Number.isFinite(p.value) && p.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!pts.length) return null;
  const total = pts.reduce((s, p) => s + p.weight, 0);
  const half = total / 2;
  // Relative tolerance so near-equal float weights (e.g. a huge half-life) still hit the boundary.
  const eps = total * 1e-9;
  let cum = 0;
  for (let i = 0; i < pts.length; i++) {
    cum += pts[i].weight;
    if (Math.abs(cum - half) <= eps && i + 1 < pts.length)
      return (pts[i].value + pts[i + 1].value) / 2;
    if (cum > half) return pts[i].value;
  }
  return pts[pts.length - 1].value;
}

/** Kish effective sample size: (Σw)² / Σw². Equals n for equal weights. */
export function effectiveSampleSize(weights: readonly number[]): number {
  const w = weights.filter((x) => x > 0);
  const s = w.reduce((a, b) => a + b, 0);
  const s2 = w.reduce((a, b) => a + b * b, 0);
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Weight and today's-money price for one comp. */
export function recencyAdjust(
  price: number,
  observedAt: string | null | undefined,
  now: number,
  opts: RecencyOptions,
): WeightedPoint & { ageDays: number | null } {
  const t = observedAt ? Date.parse(observedAt) : NaN;
  const ageDays = Number.isFinite(t)
    ? Math.max(0, (now - t) / 86_400_000)
    : null;
  const half = Math.max(1, opts.halfLifeDays);
  const weightAge = ageDays ?? opts.undatedAgeDays ?? half;
  const weight = Math.pow(0.5, weightAge / half);
  if (ageDays == null) return { value: price, weight, ageDays };
  const months = ageDays / DAYS_PER_MONTH;
  const dep = Math.min(0.5, Math.max(0, opts.depreciationPerMonth ?? 0));
  const infl = opts.inflationPerMonth ?? DEFAULT_INFLATION_PER_MONTH;
  const value = price * Math.pow(1 - dep, months) * Math.pow(1 + infl, months);
  return { value, weight, ageDays };
}

/**
 * Data-backed monthly depreciation from our own comps: fit ln(price) on model year (cross-section).
 * One model-year older ≈ one year more depreciation, so monthly = 1 − exp(−slope / 12).
 * Needs n >= 8 priced comps across >= 3 distinct model years and a positive slope; else null.
 * Callers should pre-filter to one make/model/title lane (as for aggregateComps).
 */
export function estimateMonthlyDepreciation(
  comps: ReadonlyArray<{ price: number; year?: number | null }>,
): { perMonth: number; perYear: number; n: number; years: number } | null {
  const pts = comps
    .map((c) => ({ x: Number(c.year), y: Math.log(Number(c.price)) }))
    .filter((p) => Number.isFinite(p.x) && p.x > 1900 && Number.isFinite(p.y));
  const years = new Set(pts.map((p) => p.x)).size;
  if (pts.length < 8 || years < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  if (!(slope > 0)) return null;
  const perYear = 1 - Math.exp(-slope);
  const perMonth = 1 - Math.exp(-slope / 12);
  return {
    perMonth: Math.round(perMonth * 10000) / 10000,
    perYear: Math.round(perYear * 1000) / 1000,
    n,
    years,
  };
}
