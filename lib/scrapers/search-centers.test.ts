import { describe, expect, it } from "vitest";
import { buyerSearchCenters } from "./search-centers";
import { MISSOURI_SEARCH_ZIPS } from "@/lib/geo/missouri-markets";

describe("buyer search centers", () => {
  it("covers every configured Missouri metro instead of a Dallas fallback", () => {
    expect(buyerSearchCenters({ state: "MO" })).toEqual(MISSOURI_SEARCH_ZIPS);
    expect(MISSOURI_SEARCH_ZIPS).toHaveLength(17);
  });
  it("deduplicates selected states without introducing other states", () => {
    expect(buyerSearchCenters({ state: "MO", states: ["MO", "IL"] })).toEqual([
      ...MISSOURI_SEARCH_ZIPS,
      "60601",
      "62701",
      "62901",
    ]);
    expect(buyerSearchCenters({ state: "ZZ" })).toEqual([]);
    expect(buyerSearchCenters()).toEqual([]);
  });
});
