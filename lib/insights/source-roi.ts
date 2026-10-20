// Pure aggregation for /api/insights/source-roi — extracted so it can be unit-tested without a DB.
// Given a dealer's logged outcomes (+ a deal_id→source map), bucket profit by acquisition source
// and by exit channel. No AI, no I/O.

import {
  completeOutcomeRows,
  ledgerTotals,
  type LedgerRow,
} from "@/lib/outcomes/ledger";
export type OutcomeRow = LedgerRow;

export interface RoiRow {
  key: string;
  deals: number;
  totalProfit: number;
  avgProfit: number;
  winRate: number; // % of deals with profit > 0
  avgDays: number | null;
}

interface Bucket {
  key: string;
  deals: number;
  totalProfit: number;
  wins: number;
  daysSum: number;
  daysN: number;
}

function emptyBucket(key: string): Bucket {
  return { key, deals: 0, totalProfit: 0, wins: 0, daysSum: 0, daysN: 0 };
}

function summarize(map: Map<string, Bucket>): RoiRow[] {
  return Array.from(map.values())
    .map((b) => ({
      key: b.key,
      deals: b.deals,
      totalProfit: Math.round(b.totalProfit),
      avgProfit: b.deals ? Math.round(b.totalProfit / b.deals) : 0,
      winRate: b.deals ? Math.round((b.wins / b.deals) * 100) : 0,
      avgDays: b.daysN ? Math.round(b.daysSum / b.daysN) : null,
    }))
    .sort((a, b) => b.avgProfit - a.avgProfit);
}

/** Never confuse a gross sale/purchase spread or unreviewed legacy number with net profit. */
export function outcomeProfit(row: OutcomeRow): number | null {
  return ledgerTotals(row).profit;
}

export function aggregateOutcomes(
  rows: OutcomeRow[],
  sourceById: Map<string, string>,
): { bySource: RoiRow[]; byChannel: RoiRow[] } {
  const bySource = new Map<string, Bucket>();
  const byChannel = new Map<string, Bucket>();

  for (const r of completeOutcomeRows(rows)) {
    const profit = outcomeProfit(r);
    if (profit == null) continue;

    const src = r.deal_id ? sourceById.get(r.deal_id) || "unknown" : "manual";
    const chan = (r.sold_where || "").trim().toLowerCase() || "unspecified";

    for (const [map, key] of [
      [bySource, src],
      [byChannel, chan],
    ] as [Map<string, Bucket>, string][]) {
      if (!map.has(key)) map.set(key, emptyBucket(key));
      const b = map.get(key)!;
      b.deals++;
      b.totalProfit += profit;
      if (profit > 0) b.wins++;
      const days = ledgerTotals(r).daysToSell;
      if (days != null) {
        b.daysSum += days;
        b.daysN++;
      }
    }
  }

  return { bySource: summarize(bySource), byChannel: summarize(byChannel) };
}
