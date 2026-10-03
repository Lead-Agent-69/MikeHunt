import { describe, expect, it } from "vitest";
import {
  aggregateLiveDealsForMarketPulse,
  buildDeterministicMarketPulse,
} from "@/app/api/market/analyst/route";

describe("deterministic market analyst", () => {
  it("summarizes timing, wait, profit, and volume signals without AI", () => {
    const report = buildDeterministicMarketPulse({
      timing: [
        {
          make: "Ford",
          model: "Explorer",
          signal: "BUY_NOW",
          pct_change: 8,
          current_avg: 13500,
          data_points: 42,
        },
        {
          make: "Toyota",
          model: "Camry",
          signal: "WAIT",
          pct_change: -6,
          current_avg: 11200,
          data_points: 38,
        },
      ],
      aggs: [
        {
          year: 2022,
          make: "Ford",
          model: "Explorer",
          state: "FL",
          avg_market_value: 13397,
          avg_profit: 2100,
          unit_count: 12,
        },
      ],
    });

    expect(report).toContain("Ford Explorer");
    expect(report).toContain("Buy-now watchlist");
    expect(report).toContain("Toyota Camry");
    expect(report).toContain("Wait/caution list");
    expect(report).toContain("$2,100 avg profit");
    expect(report).toContain("live listing proof");
  });

  it("derives aggregate clusters from live deals when market tables are empty", () => {
    const aggs = aggregateLiveDealsForMarketPulse([
      {
        year: 2022,
        make: "Ford",
        model: "Explorer",
        sell_estimate: 7189,
        true_net_profit: -3473,
        location_state: "FL",
      },
      {
        year: 2022,
        make: "Ford",
        model: "Explorer",
        sell_estimate: 7704,
        true_net_profit: -3504,
        location_state: "FL",
      },
      {
        year: 2026,
        make: "Ford",
        model: "Bronco",
        sell_estimate: 10279,
        true_net_profit: -3661,
        location_state: "FL",
      },
    ]);

    expect(aggs[0]).toMatchObject({
      year: 2022,
      make: "Ford",
      model: "Explorer",
      state: "FL",
      unit_count: 2,
      avg_market_value: 7447,
      avg_profit: -3488,
    });
  });
});
