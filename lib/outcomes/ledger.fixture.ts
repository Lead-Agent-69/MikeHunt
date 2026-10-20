import type { LedgerRow } from "./ledger";
export const completeSale = (overrides: LedgerRow = {}): LedgerRow => ({
  purchase_price: 10000,
  sell_price: 16000,
  actual_buyer_fees: 1000,
  actual_tax_title: 500,
  actual_recon: 1000,
  actual_transport: 300,
  actual_holding: 200,
  actual_selling: 420,
  actual_other: 400,
  purchased_at: "2026-09-01T00:00:00.000Z",
  sold_at: "2026-10-01T00:00:00.000Z",
  costs_complete: true,
  ...overrides,
});
