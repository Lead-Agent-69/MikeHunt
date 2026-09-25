// lib/intelligence/win-patterns.ts
// Layer 2 logic: learn what THIS dealer actually makes money on, from their logged outcomes. Pure —
// the route supplies the rows. Attribute-based (make/model) so it's explainable and $0; embeddings
// can refine ranking later.

export interface WinOutcome {
  make?: string | null;
  model?: string | null;
  actual_profit?: number | null;
}

export interface WinPattern {
  make: string;
  model: string;
  count: number;
  avgProfit: number;
  totalProfit: number;
}

function modelKey(model?: string | null): string {
  return (model || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Aggregate profitable outcomes into ranked (make, model) win patterns. */
export function extractWinPatterns(
  outcomes: WinOutcome[],
  minProfit = 1,
): WinPattern[] {
  const groups = new Map<
    string,
    { make: string; model: string; profits: number[] }
  >();
  for (const o of outcomes) {
    const p = Number(o.actual_profit);
    if (!o.make || !o.model || !Number.isFinite(p) || p < minProfit) continue;
    const k = `${o.make.toLowerCase()}|${modelKey(o.model)}`;
    if (!groups.has(k))
      groups.set(k, { make: o.make, model: o.model, profits: [] });
    groups.get(k)!.profits.push(p);
  }
  return Array.from(groups.values())
    .map((g) => ({
      make: g.make,
      model: g.model,
      count: g.profits.length,
      avgProfit: Math.round(
        g.profits.reduce((s, x) => s + x, 0) / g.profits.length,
      ),
      totalProfit: Math.round(g.profits.reduce((s, x) => s + x, 0)),
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);
}

/** Does a given vehicle match one of the dealer's win patterns? */
export function matchWin(
  make: string | null | undefined,
  model: string | null | undefined,
  patterns: WinPattern[],
): { matched: boolean; avgProfit: number; count: number } {
  if (!make || !model) return { matched: false, avgProfit: 0, count: 0 };
  const mk = make.toLowerCase();
  const md = modelKey(model);
  const hit = patterns.find(
    (p) => p.make.toLowerCase() === mk && modelKey(p.model) === md,
  );
  return hit
    ? { matched: true, avgProfit: hit.avgProfit, count: hit.count }
    : { matched: false, avgProfit: 0, count: 0 };
}
