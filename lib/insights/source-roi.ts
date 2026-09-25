// Pure aggregation for /api/insights/source-roi — extracted so it can be unit-tested without a DB.
// Given a dealer's logged outcomes (+ a deal_id→source map), bucket profit by acquisition source
// and by exit channel. No AI, no I/O.

export interface OutcomeRow {
  deal_id?: string | null;
  actual_profit?: number | string | null;
  sell_price?: number | string | null;
  purchase_price?: number | string | null;
  days_to_sell?: number | string | null;
  sold_where?: string | null;
}

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

/** Profit for an outcome: logged actual_profit, else sell - purchase, else null (excluded). */
export function outcomeProfit(r: OutcomeRow): number | null {
  if (r.actual_profit != null && r.actual_profit !== "") {
    const p = Number(r.actual_profit);
    return Number.isFinite(p) ? p : null;
  }
  if (
    r.sell_price != null &&
    r.sell_price !== "" &&
    r.purchase_price != null &&
    r.purchase_price !== ""
  ) {
    const p = Number(r.sell_price) - Number(r.purchase_price);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

export function aggregateOutcomes(
  rows: OutcomeRow[],
  sourceById: Map<string, string>,
): { bySource: RoiRow[]; byChannel: RoiRow[] } {
  const bySource = new Map<string, Bucket>();
  const byChannel = new Map<string, Bucket>();

  for (const r of rows) {
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
      if (r.days_to_sell != null && r.days_to_sell !== "") {
        b.daysSum += Number(r.days_to_sell);
        b.daysN++;
      }
    }
  }

  return { bySource: summarize(bySource), byChannel: summarize(byChannel) };
}
