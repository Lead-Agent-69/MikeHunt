/** A date-only purchase can capture a forecast on that day, never retrospectively. */
export function canCapturePurchasePrediction(
  purchasedAt: unknown,
  now = Date.now(),
) {
  if (typeof purchasedAt !== "string") return false;
  const stamp = Date.parse(purchasedAt);
  return (
    Number.isFinite(stamp) &&
    stamp <= now &&
    new Date(stamp).toISOString().slice(0, 10) ===
      new Date(now).toISOString().slice(0, 10)
  );
}

/** Exclude legacy snapshots recorded on a later day than the actual purchase. */
export function predictionPrecedesPurchase(
  purchasedAt: unknown,
  capturedAt: unknown,
) {
  if (typeof purchasedAt !== "string" || typeof capturedAt !== "string")
    return false;
  const purchase = Date.parse(purchasedAt),
    captured = Date.parse(capturedAt);
  return (
    Number.isFinite(purchase) &&
    Number.isFinite(captured) &&
    new Date(captured).toISOString().slice(0, 10) <=
      new Date(purchase).toISOString().slice(0, 10)
  );
}
