// lib/valuation/net-range.ts
// Net profit as a range (low / expected / high) instead of one number. Same cost model as the
// arbitrage engine (net = resale − ask − fees − transport − recon − repair − selling cost); the
// only difference is that repair (and optionally resale) is a band. Pure arithmetic: every input
// is either measured (comps, ask, fee model, haversine transport) or comes from a labelled
// heuristic (repair range). Holding cost is opt-in and must be passed explicitly.

import { sellingCostFor } from "@/lib/arbitrage/constants";

export interface NetRangeInput {
  /** Comp-backed resale (null = no comps → no net, same rule as the engine). */
  expectedResale: number | null;
  /** Optional resale band (e.g. comp IQR); defaults to the point value on both ends. */
  resaleLow?: number | null;
  resaleHigh?: number | null;
  ask: number;
  fees: number;
  transport: number;
  recon: number;
  repair: { low: number; mid: number; high: number };
  /** Opt-in holding cost (see lib/valuation/liquidity holdingCost). Omitted = not included. */
  holdingCost?: number | null;
}

export interface NetRange {
  low: number;
  expected: number;
  high: number;
  holdingIncluded: boolean;
}

export function netProfitRange(input: NetRangeInput): NetRange | null {
  const mid = Number(input.expectedResale);
  if (input.expectedResale == null || !Number.isFinite(mid) || mid <= 0)
    return null;
  const rLo = Number(input.resaleLow ?? mid);
  const rHi = Number(input.resaleHigh ?? mid);
  const fixed =
    input.ask +
    input.fees +
    input.transport +
    input.recon +
    (input.holdingCost && input.holdingCost > 0 ? input.holdingCost : 0);
  const net = (resale: number, repair: number) =>
    Math.round(resale - fixed - repair - sellingCostFor(resale));
  return {
    // Worst case: low resale, high repair. Best case: high resale, low repair.
    low: net(Math.min(rLo, mid), input.repair.high),
    expected: net(mid, input.repair.mid),
    high: net(Math.max(rHi, mid), input.repair.low),
    holdingIncluded: !!(input.holdingCost && input.holdingCost > 0),
  };
}
