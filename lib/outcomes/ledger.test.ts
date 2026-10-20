import { describe, expect, it } from "vitest";
import {
  actualAmount,
  sameOutcomeActuals,
  completeOutcomeRows,
  ledgerTotals,
  publicOutcome,
  validateOutcome,
} from "./ledger";
import { completeSale } from "./ledger.fixture";
describe("actual outcome ledger", () => {
  it("calculates net after every expense, retaining cents and losses", () => {
    expect(ledgerTotals(completeSale())).toMatchObject({
      totalCost: 13820,
      profit: 2180,
      daysToSell: 30,
      complete: true,
    });
    expect(ledgerTotals(completeSale({ sell_price: "12000.25" })).profit).toBe(
      -1819.75,
    );
  });
  it.each([
    "actual_buyer_fees",
    "actual_tax_title",
    "actual_recon",
    "actual_transport",
    "actual_holding",
    "actual_selling",
    "actual_other",
  ])("withholds net with missing %s", (key) => {
    expect(ledgerTotals(completeSale({ [key]: null })).profit).toBeNull();
  });
  it("distinguishes a known zero from missing costs and same-day sales from unknown timing", () => {
    expect(
      ledgerTotals(
        completeSale({ actual_recon: 0, sold_at: "2026-09-01T00:00:00.000Z" }),
      ),
    ).toMatchObject({ profit: 3180, daysToSell: 0 });
  });
  it("keeps an explicitly recorded zero-proceeds exit as a full loss", () => {
    expect(validateOutcome(completeSale({ sell_price: 0 })).valid).toBe(true);
    expect(ledgerTotals(completeSale({ sell_price: 0 }))).toMatchObject({
      profit: -13820,
      complete: true,
    });
  });
  it.each([
    {},
    { costs_complete: false },
    { sold_at: null },
    { purchased_at: null },
    { sold_at: "2026-08-01" },
    { sold_at: "2999-01-01" },
    { purchased_at: "2026-02-30" },
  ])("never exposes an unconfirmed legacy profit: %j", (overrides) => {
    const row = Object.keys(overrides).length
      ? completeSale(overrides)
      : { actual_profit: 9000, sell_price: 16000, purchase_price: 10000 };
    expect(publicOutcome(row).actual_profit).toBeNull();
  });
  it.each([
    true,
    [],
    {},
    "",
    "NaN",
    Infinity,
    -1,
    "1e3",
    "0x20",
    "1.234",
    "100,000",
    100000001,
  ])("rejects invalid monetary input %j", (input) =>
    expect(actualAmount(input)).toBeNull(),
  );
  it("validates a complete sale and ignores client profit and predictions", () => {
    const result = validateOutcome({
      ...completeSale(),
      actual_profit: 999999,
      predicted_profit: 999999,
    });
    expect(result.valid).toBe(true);
    expect(result.row).not.toHaveProperty("actual_profit");
    expect(result.row).not.toHaveProperty("predicted_profit");
  });
  it("permits an unfinished purchase, but rejects sales without dates and confirmation with missing costs", () => {
    expect(validateOutcome({ purchase_price: 12000 }).valid).toBe(true);
    expect(
      validateOutcome({ purchase_price: 12000, sell_price: 15000 }).errors
        .sold_at,
    ).toBeTruthy();
    expect(
      validateOutcome({ purchase_price: 12000, costs_complete: true }).errors
        .actual_recon,
    ).toBeTruthy();
  });
  it("collapses duplicate purchase records and keeps separate purchase cycles", () => {
    const a = completeSale({ id: "one", inventory_id: "inventory" });
    expect(
      completeOutcomeRows([
        a,
        { ...a, id: "two" },
        completeSale({ deal_id: "deal" }),
        completeSale({ deal_id: "deal", purchased_at: "2026-09-02" }),
      ]),
    ).toHaveLength(3);
  });
  it("uses the latest reviewed duplicate regardless of query order, without mutating input", () => {
    const old = completeSale({
      id: "old",
      inventory_id: "car",
      updated_at: "2026-10-01",
      sell_price: 16000,
    });
    const recent = {
      ...old,
      id: "recent",
      updated_at: "2026-10-02",
      sell_price: 12000,
    };
    const input = [old, recent];
    expect(completeOutcomeRows(input).map((row) => row.id)).toEqual(["recent"]);
    expect(input[0]).toBe(old);
  });
  it("acknowledges normalized money and dates, but never different dates, notes or missing costs", () => {
    const row = completeSale({ notes: "receipt A", sold_where: "private" });
    expect(
      sameOutcomeActuals(
        {
          ...row,
          purchase_price: "10000.00",
          sold_at: "2026-10-01T00:00:00+00:00",
        },
        row,
      ),
    ).toBe(true);
    for (const change of [
      { sold_at: "2026-10-02" },
      { notes: "receipt B" },
      { actual_recon: null },
      { sold_where: "dealer" },
    ])
      expect(sameOutcomeActuals({ ...row, ...change }, row)).toBe(false);
  });
});
