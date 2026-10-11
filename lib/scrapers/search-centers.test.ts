import { describe, expect, it } from "vitest";
import { buyerSearchCenters } from "./search-centers";

describe("buyer search centers", () => {
  it("covers every configured Missouri metro instead of a Dallas fallback", () => {
    expect(buyerSearchCenters({ state: "MO" })).toEqual([
      "63101",
      "64106",
      "65806",
    ]);
  });
  it("deduplicates selected states without introducing other states", () => {
    expect(buyerSearchCenters({ state: "MO", states: ["MO", "IL"] })).toEqual([
      "63101",
      "64106",
      "65806",
      "60601",
      "62701",
      "62901",
    ]);
    expect(buyerSearchCenters({ state: "ZZ" })).toEqual([]);
    expect(buyerSearchCenters()).toEqual([]);
  });
});
