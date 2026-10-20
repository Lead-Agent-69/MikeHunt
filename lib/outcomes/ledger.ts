/** Owner-reported actuals, never estimates or independent sale verification. */
export const ACTUAL_COST_FIELDS = {
  actual_buyer_fees: "Buyer / auction fees",
  actual_tax_title: "Tax, title and registration",
  actual_recon: "Repair and preparation",
  actual_transport: "Transport and pickup",
  actual_holding: "Holding and financing",
  actual_selling: "Selling fees and expenses",
  actual_other: "Other actual costs",
} as const;
export type ActualCostField = keyof typeof ACTUAL_COST_FIELDS;
export const actualCostFields = Object.keys(
  ACTUAL_COST_FIELDS,
) as ActualCostField[];
export const LEDGER_MONEY_FIELDS = [
  "purchase_price",
  "sell_price",
  ...actualCostFields,
] as const;
export type LedgerMoneyField = (typeof LEDGER_MONEY_FIELDS)[number];
export type LedgerRow = Partial<
  Record<LedgerMoneyField, number | string | null>
> & {
  id?: string;
  user_id?: string;
  deal_id?: string | null;
  inventory_id?: string | null;
  revision?: number;
  purchased_at?: string | null;
  sold_at?: string | null;
  costs_complete?: boolean;
  actual_profit?: number | string | null;
  actual_all_in_cost?: number | null;
  actual_fees?: number | string | null;
  days_to_sell?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  sold_where?: string | null;
  notes?: string | null;
  updated_at?: string;
  prediction_basis?: string;
  prediction_captured_at?: string | null;
  predicted_sell?: number | null;
  predicted_profit?: number | null;
  predicted_transport?: number | null;
  predicted_recon?: number | null;
};
export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function actualAmount(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000
    ? Math.round(n * 100) / 100
    : null;
}
function dateStamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(value))
    return null;
  const t = Date.parse(value);
  return Number.isFinite(t) &&
    new Date(t).toISOString().slice(0, 10) === value.slice(0, 10)
    ? t
    : null;
}
export function ledgerTotals(row: LedgerRow) {
  const purchase = actualAmount(row.purchase_price);
  const sale = actualAmount(row.sell_price);
  const missing = actualCostFields.filter(
    (key) => actualAmount(row[key]) == null,
  );
  const purchased = dateStamp(row.purchased_at);
  const sold = dateStamp(row.sold_at);
  const datedPurchase = purchased != null && purchased <= Date.now();
  const datedSale =
    datedPurchase && sold != null && sold >= purchased && sold <= Date.now();
  const costsReady =
    purchase != null && purchase > 0 && !missing.length && datedPurchase;
  const total = costsReady
    ? (Math.round(purchase * 100) +
        actualCostFields.reduce(
          (sum, key) => sum + Math.round(actualAmount(row[key])! * 100),
          0,
        )) /
      100
    : null;
  const complete =
    row.costs_complete === true &&
    total != null &&
    sale != null &&
    sale >= 0 &&
    datedSale;
  const profit = complete ? Math.round((sale - total) * 100) / 100 : null;
  return {
    missing,
    costsReady,
    complete,
    totalCost: row.costs_complete === true ? total : null,
    profit,
    roiPct: profit != null && total! > 0 ? (profit / total!) * 100 : null,
    daysToSell: datedSale
      ? Math.round(
          (Date.parse(new Date(sold!).toISOString().slice(0, 10)) -
            Date.parse(new Date(purchased!).toISOString().slice(0, 10))) /
            86400000,
        )
      : null,
    status: complete
      ? ("complete" as const)
      : sale != null
        ? ("sale_needs_costs" as const)
        : ("purchased" as const),
  };
}
export function publicOutcome<T extends LedgerRow>(row: T) {
  const totals = ledgerTotals(row);
  return {
    ...row,
    actual_profit: totals.profit,
    actual_all_in_cost: totals.totalCost,
    days_to_sell: totals.daysToSell,
    actual_roi_pct: totals.roiPct,
    ledger_status: totals.status,
    evidence_basis: "owner_reported" as const,
  };
}
export const OUTCOME_LEDGER_COLUMNS =
  "id,deal_id,inventory_id,purchase_price,sell_price,actual_buyer_fees,actual_tax_title,actual_recon,actual_transport,actual_holding,actual_selling,actual_other,costs_complete,purchased_at,sold_at,actual_profit,days_to_sell";

export function validateOutcome(
  input: Record<string, unknown>,
  now = Date.now(),
) {
  const errors: Record<string, string> = {};
  const row: LedgerRow = {};
  for (const key of LEDGER_MONEY_FIELDS) {
    const raw = input[key];
    const empty = raw == null || raw === "";
    const amount = actualAmount(raw);
    if (!empty && amount == null)
      errors[key] = "Enter 0 or a positive amount, with at most two decimals.";
    row[key] = empty ? null : amount;
  }
  if (!(Number(row.purchase_price) > 0))
    errors.purchase_price = "Enter the actual purchase price.";
  for (const key of ["purchased_at", "sold_at"] as const) {
    const raw = input[key];
    const stamp = dateStamp(raw);
    row[key] = stamp == null ? null : new Date(stamp).toISOString();
    if (raw != null && raw !== "" && (stamp == null || stamp > now))
      errors[key] = "Enter a valid date that is not in the future.";
  }
  if (row.sell_price != null && (!row.purchased_at || !row.sold_at))
    errors.sold_at = "A reported sale needs purchase and sale dates.";
  if (row.sold_at && row.sell_price == null)
    errors.sell_price = "Enter the sale amount or clear the sale date.";
  if (row.purchased_at && row.sold_at && row.sold_at < row.purchased_at)
    errors.sold_at = "The sale date cannot be before the purchase date.";
  if (input.costs_complete != null && typeof input.costs_complete !== "boolean")
    errors.costs_complete = "Confirm the costs using the checkbox.";
  row.costs_complete = input.costs_complete === true;
  if (row.costs_complete) {
    if (!row.purchased_at) errors.purchased_at = "Confirm the purchase date.";
    for (const key of actualCostFields)
      if (row[key] == null)
        errors[key] = "Enter the actual amount, including 0 if none applies.";
  }
  for (const [key, max] of [
    ["make", 80],
    ["model", 120],
    ["sold_where", 100],
    ["notes", 2000],
  ] as const) {
    const raw = input[key];
    if (raw != null && typeof raw !== "string") errors[key] = "Enter text.";
    else if (typeof raw === "string" && raw.trim().length > max)
      errors[key] = `Use at most ${max} characters.`;
    else row[key] = typeof raw === "string" ? raw.trim() || null : null;
  }
  const year = input.year;
  if (year != null && year !== "") {
    if (
      typeof year !== "number" ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > new Date(now).getUTCFullYear() + 1
    )
      errors.year = "Enter a valid model year.";
    else row.year = year;
  } else row.year = null;
  // Old clients can preserve their aggregate fee amount, but cannot confirm a complete ledger with it.
  if (input.actual_fees != null && actualAmount(input.actual_fees) == null)
    errors.actual_fees = "Enter a valid fee amount.";
  row.actual_fees = actualAmount(input.actual_fees);
  return { row, errors, valid: !Object.keys(errors).length };
}

/** Collapse duplicate logs of one inventory purchase; preserve distinct dated purchase cycles. */
export function completeOutcomeRows<T extends LedgerRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!ledgerTotals(row).complete) return false;
    const key =
      row.inventory_id ||
      (row.deal_id
        ? `${row.deal_id}:${row.purchased_at?.slice(0, 10)}`
        : row.id);
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}
