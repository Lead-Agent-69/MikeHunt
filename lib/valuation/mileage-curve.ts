type CurvePoint = { mileage: number; price: number };

/** Interpolate only within the observed mileage range; do not invent a distant comp. */
export function mileageCurvePrice(
  trend: readonly CurvePoint[] | null | undefined,
  mileage: number | null | undefined,
): number | null {
  if (!trend || trend.length !== 2 || mileage == null) return null;
  const [a, b] = trend;
  if (
    ![a.mileage, b.mileage, a.price, b.price, mileage].every(Number.isFinite) ||
    a.mileage < 0 ||
    b.mileage < 0 ||
    mileage < 0 ||
    a.price <= 0 ||
    b.price <= 0 ||
    a.mileage === b.mileage ||
    mileage < Math.min(a.mileage, b.mileage) ||
    mileage > Math.max(a.mileage, b.mileage)
  )
    return null;
  const slope = (b.price - a.price) / (b.mileage - a.mileage);
  const price = Math.round(a.price + slope * (mileage - a.mileage));
  return Number.isFinite(price) && price > 0 ? price : null;
}
