// lib/intelligence/mispricing.ts
// Layer 3 logic: spot deals priced as statistical outliers below their own make/model/year cluster.
// Pure stats over prices the route supplies. $0, no AI.

export interface ClusterStats {
  n: number;
  median: number;
  mean: number;
  std: number;
}

export function clusterStats(prices: number[]): ClusterStats | null {
  const xs = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (xs.length < 4) return null; // need a few peers to mean anything
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  const std = Math.sqrt(variance);
  return { n: xs.length, median, mean, std };
}

export interface Mispricing {
  pctBelowCluster: number; // % below the cluster median (positive = cheaper)
  z: number; // z-score vs cluster mean (negative = below)
}

/** Returns how mispriced an ask is vs its cluster, or null if the cluster is too thin. */
export function mispricingOf(ask: number, prices: number[]): Mispricing | null {
  const s = clusterStats(prices);
  if (!s || !ask || ask <= 0 || s.median <= 0) return null;
  const pctBelowCluster = ((s.median - ask) / s.median) * 100;
  const z = s.std > 0 ? (ask - s.mean) / s.std : 0;
  return {
    pctBelowCluster: Math.round(pctBelowCluster * 10) / 10,
    z: Math.round(z * 100) / 100,
  };
}

/** Is this a genuine underpriced outlier? (meaningfully below median AND a low z-score). */
export function isUnderpriced(m: Mispricing | null): boolean {
  return !!m && m.pctBelowCluster >= 15 && m.z <= -0.8;
}
