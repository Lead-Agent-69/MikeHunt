/** Simple monthly rate, prorated over a 30-day planning month; not APR or a lender quote. */
export function carryingCost(
  principal: number,
  monthlyPercent: number,
  days: number,
) {
  if (
    ![principal, monthlyPercent, days].every(Number.isFinite) ||
    principal < 0 ||
    monthlyPercent < 0 ||
    days < 0
  )
    return null;
  const monthly = (principal * monthlyPercent) / 100;
  if (!Number.isFinite(monthly) || !Number.isFinite((monthly / 30) * days))
    return null;
  return { daily: monthly / 30, monthly, total: (monthly / 30) * days };
}
