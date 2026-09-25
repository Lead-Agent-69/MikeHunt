import { describe, it, expect } from "vitest";
import { aggregateOutcomes, outcomeProfit } from "./source-roi";

describe("outcomeProfit", () => {
  it("prefers logged actual_profit", () => {
    expect(
      outcomeProfit({ actual_profit: 2500, sell_price: 1, purchase_price: 1 }),
    ).toBe(2500);
  });
  it("falls back to sell - purchase", () => {
    expect(outcomeProfit({ sell_price: 17500, purchase_price: 12000 })).toBe(
      5500,
    );
  });
  it("returns null when neither is available", () => {
    expect(outcomeProfit({ sold_where: "lot" })).toBeNull();
  });
  it("treats empty strings as missing", () => {
    expect(
      outcomeProfit({ actual_profit: "", sell_price: "", purchase_price: "" }),
    ).toBeNull();
  });
  it("coerces numeric strings", () => {
    expect(outcomeProfit({ actual_profit: "1200" })).toBe(1200);
  });
});

describe("aggregateOutcomes", () => {
  const sourceById = new Map([
    ["d1", "copart"],
    ["d2", "copart"],
    ["d3", "facebook"],
  ]);

  it("buckets by source and computes avg, win rate, avg days", () => {
    const { bySource } = aggregateOutcomes(
      [
        {
          deal_id: "d1",
          actual_profit: 3000,
          days_to_sell: 20,
          sold_where: "lot",
        },
        {
          deal_id: "d2",
          actual_profit: 1000,
          days_to_sell: 40,
          sold_where: "lot",
        },
        {
          deal_id: "d3",
          actual_profit: -500,
          days_to_sell: 60,
          sold_where: "private",
        },
      ],
      sourceById,
    );
    const copart = bySource.find((b) => b.key === "copart")!;
    expect(copart.deals).toBe(2);
    expect(copart.avgProfit).toBe(2000);
    expect(copart.winRate).toBe(100);
    expect(copart.avgDays).toBe(30);

    const fb = bySource.find((b) => b.key === "facebook")!;
    expect(fb.avgProfit).toBe(-500);
    expect(fb.winRate).toBe(0);
  });

  it("sorts sources by avgProfit descending (best first)", () => {
    const { bySource } = aggregateOutcomes(
      [
        { deal_id: "d3", actual_profit: 8000 },
        { deal_id: "d1", actual_profit: 1000 },
      ],
      sourceById,
    );
    expect(bySource[0].key).toBe("facebook");
  });

  it("labels outcomes without a deal_id as 'manual' and missing channel as 'unspecified'", () => {
    const { bySource, byChannel } = aggregateOutcomes(
      [{ actual_profit: 1500 }],
      new Map(),
    );
    expect(bySource[0].key).toBe("manual");
    expect(byChannel[0].key).toBe("unspecified");
  });

  it("labels a deal_id with no known source as 'unknown'", () => {
    const { bySource } = aggregateOutcomes(
      [{ deal_id: "ghost", actual_profit: 100 }],
      new Map(),
    );
    expect(bySource[0].key).toBe("unknown");
  });

  it("normalizes channel casing/whitespace", () => {
    const { byChannel } = aggregateOutcomes(
      [
        { actual_profit: 1, sold_where: "CarMax" },
        { actual_profit: 1, sold_where: " carmax " },
      ],
      new Map(),
    );
    expect(byChannel).toHaveLength(1);
    expect(byChannel[0].key).toBe("carmax");
    expect(byChannel[0].deals).toBe(2);
  });

  it("excludes outcomes with no derivable profit", () => {
    const { bySource } = aggregateOutcomes(
      [
        { deal_id: "d1", sold_where: "lot" },
        { deal_id: "d1", actual_profit: 500 },
      ],
      sourceById,
    );
    expect(bySource[0].deals).toBe(1);
  });

  it("returns empty arrays for no rows", () => {
    expect(aggregateOutcomes([], new Map())).toEqual({
      bySource: [],
      byChannel: [],
    });
  });
});
