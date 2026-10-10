import { describe, expect, it } from "vitest";
import {
  applyGoProfitPolicy,
  enforceGoProfitFloor,
  goProfitFloor,
} from "./go-policy";

describe("GO profit policy", () => {
  it("keeps the global floor and respects higher personal targets", () => {
    for (const target of [undefined, null, 0, -1, 1500, NaN, Infinity])
      expect(goProfitFloor(target)).toBe(3000);
    expect(goProfitFloor(5000)).toBe(5000);
    expect(enforceGoProfitFloor("go", 3000)).toBe("go");
    expect(enforceGoProfitFloor("go", 2999)).toBe("hold");
    expect(enforceGoProfitFloor("GO", 4000, 5000)).toBe("HOLD");
  });
  it("never invents a GO from missing profit or promotes a weaker verdict", () => {
    for (const profit of [undefined, null, NaN, Infinity, -Infinity])
      expect(enforceGoProfitFloor("go", profit)).toBe("hold");
    expect(enforceGoProfitFloor("hold", 10000)).toBe("hold");
    expect(enforceGoProfitFloor("pass", 10000)).toBe("pass");
    expect(enforceGoProfitFloor("not_enough_data", 10000)).toBe(
      "not_enough_data",
    );
  });
  it("preserves listing data and never mutates stored payloads", () => {
    const row = {
      id: "saved",
      true_net_profit: 2000,
      dealVerdict: "go",
      images: ["a"],
    };
    expect(applyGoProfitPolicy(row)).toEqual({ ...row, dealVerdict: "hold" });
    expect(row.dealVerdict).toBe("go");
    expect(
      applyGoProfitPolicy({ verdict: "GO", netProfit: "3000" }).verdict,
    ).toBe("GO");
    expect(
      applyGoProfitPolicy({ deal_verdict: "go", trueNetProfit: 0 })
        .deal_verdict,
    ).toBe("hold");
    expect(
      applyGoProfitPolicy({ dealVerdict: "go", profitEstimate: 9000 })
        .dealVerdict,
    ).toBe("hold");
  });
  it("removes stale buy urgency but preserves useful forecasts and cost evidence", () => {
    const row = {
      verdict: "go",
      netProfit: 2000,
      is_arbitrage_opportunity: true,
      prediction: {
        urgency: "act_now",
        daysToSell: 15,
        reasons: ["Act now - won't last", "Verify condition"],
      },
      deal_analysis: {
        costs: { repair: 500 },
        prediction: { urgency: "act_now" },
      },
    };
    const out = applyGoProfitPolicy(row);
    expect(out.prediction).toEqual({
      urgency: "none",
      daysToSell: 15,
      reasons: ["Verify condition"],
    });
    expect(out.is_arbitrage_opportunity).toBe(false);
    expect(out.deal_analysis.costs.repair).toBe(500);
    expect(out.deal_analysis.prediction.urgency).toBe("none");
    expect(row.prediction.urgency).toBe("act_now");
  });
});
