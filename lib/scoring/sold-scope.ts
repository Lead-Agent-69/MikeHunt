// lib/scoring/sold-scope.ts
// Which sold_listings rows a reader may use.
//
//   retail comps (medians, averages, arbitrage, valuations): basis = 'sold' AND (sale_channel IS NULL
//     OR sale_channel = 'ebay'). eBay completed sales are retail prices (migration 20261010500000).
//     Gov impound / fleet / surplus sales (Norfolk, Seattle, GovDeals/AllSurplus sold lots) carry a
//     sale_channel and never count as retail prices. GSA rows are basis = 'last_bid' and never count
//     as sales at all.
//   gov lane (shown separately, always with its attribution): basis = 'sold' AND sale_channel set
//     and not a retail channel.
//   closing bids (GSA, shown separately with the CC BY credit): basis = 'last_bid'.
//
// Rollout: readers can ship before migrations 20261010130000 (basis) / 20261010410000 (sale_channel)
// are applied. A missing column is retried without that filter, which is safe: before 410000 no row
// can carry a sale_channel or 'last_bid' (the writer refuses to write without those columns).

import { SOLD_BASIS, isMissingBasisColumn } from "./sold-basis";
import { RETAIL_SALE_CHANNELS } from "./sale-channels";

type PgError =
  | { code?: string | null; message?: string | null }
  | null
  | undefined;

// Channel lists live in ./sale-channels (single source of truth, CI-checked against the migrations).
export { GOV_SALE_CHANNELS, RETAIL_SALE_CHANNELS } from "./sale-channels";

/** PostgREST `or` filter for the retail channels: sale_channel IS NULL OR one of RETAIL_SALE_CHANNELS. */
export const RETAIL_CHANNEL_OR = [
  "sale_channel.is.null",
  ...RETAIL_SALE_CHANNELS.map((c) => `sale_channel.eq.${c}`),
].join(",");

export interface SoldScope {
  /** Filter basis = 'sold' (false only when the basis column doesn't exist yet). */
  basis: boolean;
  /** Filter to retail channels (false only when the sale_channel column doesn't exist yet). */
  retailOnly: boolean;
}

export function isMissingSaleChannelColumn(error: PgError): boolean {
  if (!error) return false;
  const msg = String(error.message || "");
  if (!/\bsale_channel\b/i.test(msg)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|could not find/i.test(msg)
  );
}

/** Apply the retail-comp filters to a PostgREST query builder. */
// A separate `or` param is ANDed with any other `or` on the query (e.g. the model match).
export function applyRetailSoldScope<Q extends { eq: any; or: any }>(
  q: Q,
  scope: SoldScope,
): Q {
  let out: any = q;
  if (scope.basis) out = out.eq("basis", SOLD_BASIS);
  if (scope.retailOnly) out = out.or(RETAIL_CHANNEL_OR);
  return out as Q;
}

/**
 * Run a retail sold-comp read: basis = 'sold' AND a retail sale_channel, dropping a filter only when
 * its column is missing (migration not applied yet). Any other error is returned untouched.
 */
export async function withRetailSold<R extends { error: PgError }>(
  run: (scope: SoldScope) => PromiseLike<R>,
): Promise<R> {
  const scope: SoldScope = { basis: true, retailOnly: true };
  let res = await run(scope);
  for (let i = 0; i < 2 && res?.error; i++) {
    if (scope.retailOnly && isMissingSaleChannelColumn(res.error))
      scope.retailOnly = false;
    else if (scope.basis && isMissingBasisColumn(res.error)) {
      // basis and sale_channel both arrive after 130000; without basis there is no sale_channel either.
      scope.basis = false;
      scope.retailOnly = false;
    } else break;
    res = await run({ ...scope });
  }
  return res;
}

/** In-memory guard for rows already loaded: retail only when sold and a retail (or no) sale_channel. */
export function isRetailSoldRow(row: {
  basis?: string | null;
  sale_channel?: string | null;
}): boolean {
  return (
    (row.basis == null || row.basis === SOLD_BASIS) &&
    (!row.sale_channel ||
      (RETAIL_SALE_CHANNELS as readonly string[]).includes(row.sale_channel))
  );
}
