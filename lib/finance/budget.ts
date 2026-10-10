export function budgetAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount <= 1e9
    ? Math.round(amount * 100)
    : null;
}
export function budgetTotal(values: string[]): number | null {
  const cents = values.map(budgetAmount);
  return cents.some((value) => value === null)
    ? null
    : (cents as number[]).reduce((sum, value) => sum + value, 0) / 100;
}
