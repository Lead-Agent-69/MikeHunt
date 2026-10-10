// lib/scoring/sold-basis.ts
// sold_listings.basis says what a row's price is: 'sold' is a completed sale; 'removed' (planned) is a
// listing that disappeared with its last ask, which is not a sale price. Every sold-comp reader asks
// for basis = 'sold' only.
//
// Rollout order: code can ship before migration 20261010130000_sold_listings_basis.sql is applied.
// Until then PostgREST rejects the unknown column (42703 / "column ... basis does not exist"), so
// withSoldBasis retries once without the filter. That is safe because, before the migration, no row
// can be anything but a sale: nothing writes basis = 'removed' yet.

export const SOLD_BASIS = "sold" as const;
export type SoldBasis = "sold" | "removed";

type PgError =
  | { code?: string | null; message?: string | null }
  | null
  | undefined;

/** True when the error is PostgREST/Postgres saying sold_listings.basis does not exist yet. */
export function isMissingBasisColumn(error: PgError): boolean {
  if (!error) return false;
  const msg = String(error.message || "");
  if (!/\bbasis\b/i.test(msg)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /does not exist|could not find/i.test(msg)
  );
}

/**
 * Run a sold_listings read with `.eq("basis", "sold")`, falling back to the same read without it only
 * when the column is missing (migration not applied yet). Any other error is returned untouched.
 */
export async function withSoldBasis<R extends { error: PgError }>(
  run: (filterBasis: boolean) => PromiseLike<R>,
): Promise<R> {
  const first = await run(true);
  if (first?.error && isMissingBasisColumn(first.error)) return run(false);
  return first;
}

/** Row-level guard for rows already in memory: a missing basis (pre-migration) counts as sold. */
export function isSoldBasisRow(row: { basis?: string | null }): boolean {
  return row.basis == null || row.basis === SOLD_BASIS;
}
