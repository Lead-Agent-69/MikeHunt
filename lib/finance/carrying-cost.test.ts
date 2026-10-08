import { expect, it } from "vitest";
import { carryingCost } from "./carrying-cost";
it("uses the monthly rate actually labelled, with disclosed 30-day proration", () => {
  expect(carryingCost(10000, 1.5, 30)).toEqual({
    daily: 5,
    monthly: 150,
    total: 150,
  });
  expect(carryingCost(10000, 1.5, 60)?.total).toBe(300);
  expect(carryingCost(10000, 0, 30)?.total).toBe(0);
});
it("rejects missing, nonfinite and negative inputs", () => {
  expect(carryingCost(NaN, 1, 30)).toBeNull();
  expect(carryingCost(10, -1, 30)).toBeNull();
  expect(carryingCost(10, 1, -30)).toBeNull();
});
