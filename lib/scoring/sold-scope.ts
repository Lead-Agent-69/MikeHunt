// Keep government auction results and observed bids out of retail valuation math.
// The fallback is rollout-only: before the migration exists, every stored row is a legacy retail
// sold observation because no writer can persist basis or sale_channel yet.

type PgError =
  | { code?: string | null; message?: string | null }
  | null
  | undefined;

export interface SoldScope {
  basis: boolean;
  retailOnly: boolean;
}

function missingColumn(error: PgError, column: string) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    new RegExp(`\\b${column}\\b`, "i").test(message) &&
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /does not exist|could not find/i.test(message))
  );
}

export function applyRetailSoldScope<Q extends { eq: any; is: any }>(
  query: Q,
  scope: SoldScope,
): Q {
  let result: any = query;
  if (scope.basis) result = result.eq("basis", "sold");
  if (scope.retailOnly) result = result.is("sale_channel", null);
  return result as Q;
}

export async function withRetailSold<R extends { error: PgError }>(
  run: (scope: SoldScope) => PromiseLike<R>,
): Promise<R> {
  const scope: SoldScope = { basis: true, retailOnly: true };
  let result = await run(scope);
  for (let attempt = 0; attempt < 2 && result.error; attempt += 1) {
    if (scope.retailOnly && missingColumn(result.error, "sale_channel")) {
      scope.retailOnly = false;
    } else if (scope.basis && missingColumn(result.error, "basis")) {
      scope.basis = false;
      scope.retailOnly = false;
    } else {
      break;
    }
    result = await run({ ...scope });
  }
  return result;
}
