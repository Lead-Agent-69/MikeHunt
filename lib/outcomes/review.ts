import {
  ACTUAL_COST_FIELDS,
  actualCostFields,
  actualAmount,
  ledgerTotals,
  validateOutcome,
  type LedgerRow,
} from "./ledger";

/** Concrete work still needed before a reported sale can count as a net result. */
export function outcomeReviewItems(row: LedgerRow) {
  if (ledgerTotals(row).complete) return [];
  const checked = validateOutcome({ ...row, costs_complete: true });
  const items: Array<{ field: string; label: string }> = [];
  if (!(Number(row.purchase_price) > 0) || checked.errors.purchase_price)
    items.push({ field: "purchase_price", label: "Actual purchase price" });
  if (!row.purchased_at || checked.errors.purchased_at)
    items.push({ field: "purchased_at", label: "Valid purchase date" });
  if (actualAmount(row.sell_price) == null)
    items.push({ field: "sell_price", label: "Actual sale price" });
  if (!row.sold_at || checked.errors.sold_at)
    items.push({ field: "sold_at", label: "Valid sale date" });
  for (const field of actualCostFields)
    if (actualAmount(row[field]) == null)
      items.push({ field, label: ACTUAL_COST_FIELDS[field] });
  if (!row.costs_complete)
    items.push({
      field: "costs_complete",
      label: "Review dates and actual expenses",
    });
  return items;
}
