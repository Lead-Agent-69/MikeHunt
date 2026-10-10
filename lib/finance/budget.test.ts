import { expect, it } from "vitest";
import { budgetAmount, budgetTotal } from "./budget";
it("keeps missing amounts unknown and preserves explicit zero and cents", () => {
  expect(budgetTotal(["", "0"])).toBeNull();
  expect(budgetTotal(["0.10", "0.20", "0"])).toBe(0.3);
  expect(budgetAmount("0")).toBe(0);
});
it("rejects nonfinite, negative, overprecision and unreasonable amounts", () => {
  for (const value of ["-1", "Infinity", "1.111", "1000000001", ""])
    expect(budgetAmount(value)).toBeNull();
});
