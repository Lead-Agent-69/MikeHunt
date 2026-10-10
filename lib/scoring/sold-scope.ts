// lib/scoring/sold-scope.ts
// Which sold_listings rows a reader may use.
//
//   retail comps (medians, averages, arbitrage, valuations): basis = 'sold' AND sale_channel IS NULL.
//     Gov impound / fleet / surplus sales (Norfolk, Seattle, GovDeals/AllSurplus sold lots) carry a
//     sale_channel and never count as retail prices. GSA rows are basis = 'last_bid' and never count
//     as sales at all.
//   gov lane (shown separately, always with its attribution): basis = 'sold' AND sale_channel set.
//   closing bids (GSA, shown separately with the CC BY credit): basis = 'last_bid'.
//
// Rollout: readers can ship before migrations 20261010130000 (basis) / 20261010410000 (sale_channel)
// are applied. A missing column is retried without that filter, which is safe: before 410000 no row
// can carry a sale_channel or 'last_bid' (the writer refuses to write without those columns).

import { SOLD_BASIS, isMissingBasisColumn } from "./sold-basis";

type PgError =
  | { code?: string | null; message?: string | null }
  | null
  | undefined;

export interface SoldScope {
  /** Filter basis = 'sold' (false only when the basis column doesn't exist yet). */
  basis: boolean;
  /** Filter sale_channel IS NULL (false only when the column doesn't exist yet). */
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
export function applyRetailSoldScope<Q extends { eq: any; is: any }>(
  q: Q,
  scope: SoldScope,
): Q {
  let out: any = q;
  if (scope.basis) out = out.eq("basis", SOLD_BASIS);
  if (scope.retailOnly) out = out.is("sale_channel", null);
  return out as Q;
}

/**
 * Run a retail sold-comp read: basis = 'sold' AND sale_channel IS NULL, dropping a filter only when
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

/** In-memory guard for rows already loaded: retail only when sold and no sale_channel. */
export function isRetailSoldRow(row: {
  basis?: string | null;
  sale_channel?: string | null;
}): boolean {
  return (row.basis == null || row.basis === SOLD_BASIS) && !row.sale_channel;
}
