import { describe, it, expect } from "vitest";
import { aggregateOutcomes, outcomeProfit } from "./source-roi";
import { completeSale } from "@/lib/outcomes/ledger.fixture";
describe("source net results", () => {
  it("never treats gross spread or legacy profit as net", () => {
    expect(
      outcomeProfit({ sell_price: 17500, purchase_price: 12000 }),
    ).toBeNull();
    expect(outcomeProfit({ actual_profit: 999999 })).toBeNull();
    expect(outcomeProfit(completeSale({ actual_profit: 999999 }))).toBe(2180);
  });
  it("aggregates complete records, losses and same-day sales by source and normalized channel", () => {
    const result = aggregateOutcomes(
      [
        completeSale({
          deal_id: "one",
          sold_where: "CarMax",
          sold_at: "2026-09-01",
        }),
        completeSale({
          deal_id: "two",
          sold_where: " carmax ",
          sell_price: 12000,
        }),
        { deal_id: "three", actual_profit: 999999 },
      ],
      new Map([
        ["one", "copart"],
        ["two", "copart"],
      ]),
    );
    expect(result.bySource).toEqual([
      {
        key: "copart",
        deals: 2,
        totalProfit: 360,
        avgProfit: 180,
        winRate: 50,
        avgDays: 15,
      },
    ]);
    expect(result.byChannel[0]).toMatchObject({ key: "carmax", deals: 2 });
  });
  it("deduplicates purchases and labels manual / unknown sources", () => {
    const row = completeSale({ id: "one", inventory_id: "inv" });
    const result = aggregateOutcomes(
      [
        row,
        { ...row, id: "two" },
        completeSale({ id: "three", deal_id: "ghost" }),
      ],
      new Map(),
    );
    expect(result.bySource.map((r) => [r.key, r.deals])).toEqual([
      ["manual", 1],
      ["unknown", 1],
    ]);
    expect(result.byChannel[0].key).toBe("unspecified");
  });
  it("returns empty results without complete sales", () =>
    expect(aggregateOutcomes([], new Map())).toEqual({
      bySource: [],
      byChannel: [],
    }));
});
