import { beforeEach, describe, expect, it } from "vitest";
import { useDealStore } from "./dealStore";

beforeEach(() => {
  useDealStore.setState({
    ...useDealStore.getInitialState(),
    userType: "dealer",
    askPrice: 1000,
    marketValue: 3999,
    titleType: "clean",
    damageSeverity: "none",
    marketDemand: "high",
    auctionFee: 0,
    transportCost: 0,
    repairCost: 0,
    reconCost: 0,
    titleFee: 0,
    floorRate: 0,
  });
});
describe("dealer scenario GO policy", () => {
  it("keeps high-score scenarios below the floor on HOLD", () => {
    useDealStore.getState().recalculate();
    expect(useDealStore.getState().profitScore).toBeGreaterThanOrEqual(80);
    expect(useDealStore.getState().netProfit).toBe(2999);
    expect(useDealStore.getState().verdict).toBe("HOLD");
  });
  it("respects higher targets without changing the scenario inputs", () => {
    useDealStore.getState().updateField("marketValue", 5000);
    expect(useDealStore.getState().verdict).toBe("GO");
    useDealStore.getState().updateField("targetProfit", 5000);
    expect(useDealStore.getState().verdict).toBe("HOLD");
    expect(useDealStore.getState().netProfit).toBe(4000);
  });
});
