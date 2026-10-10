import { dealFreshness, type FreshnessState } from "./freshness";

export type StateSplit = Record<string, Record<FreshnessState, number>>;

/** Pure: per-state live / frozen / stale / ended counts from active rows. */
export function splitStateFreshness(
  rows: readonly any[],
  now: number = Date.now(),
): StateSplit {
  const out: StateSplit = {};
  for (const row of rows) {
    const st = String(row?.location_state || "")
      .trim()
      .toUpperCase();
    if (!st) continue;
    const bucket =
      out[st] || (out[st] = { live: 0, stale: 0, frozen: 0, ended: 0 });
    bucket[dealFreshness(row, now).state] += 1;
  }
  return out;
}

/**
 * Live vs not-live rollup from the per-source breakdown (lib/deals/freshness). staleSources lists
 * every source whose rows are frozen (terms-gated, unrefreshed) or not re-seen in 72h.
 */
export function summarizeFreshness(breakdown: any[]) {
  const rows = Array.isArray(breakdown) ? breakdown : [];
  const sum = (key: string) =>
    rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
  const active = sum("active");
  const liveDeals = sum("live");
  const frozenDeals = sum("frozen");
  const staleDeals = sum("stale");
  const endedDeals = sum("ended");
  return {
    liveDeals,
    notLiveDeals: frozenDeals + staleDeals + endedDeals,
    frozenDeals,
    staleDeals,
    endedDeals,
    liveShare: active ? Math.round((liveDeals / active) * 1000) / 1000 : 0,
    staleSources: rows
      .filter((row) => row?.status === "frozen" || row?.status === "stale")
      .map((row) => ({
        source: row.source,
        status: row.status,
        ageHours: row.ageHours ?? null,
        active: Number(row.active || 0),
        live: Number(row.live || 0),
      })),
  };
}
