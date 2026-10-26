import { describe, it, expect } from "vitest";
import { checkPriceSanity } from "./price-sanity";

describe("price outlier verification", () => {
  it.each([
    [8700, 48000],
    [2850, 28000],
    [500, 30000],
  ])(
    "flags %s against %s without inventing a corrected price",
    (ask, expected) => {
      const result = checkPriceSanity(ask, expected, "clean");
      expect(result.status).toBe("implausible");
      expect(result.inferredPrice).toBeUndefined();
      expect(result.reason).toContain("Confirm the full purchase price");
      expect(result.reason).not.toMatch(
        /almost certainly|typo for|likely a deposit/i,
      );
    },
  );
  it.each([
    [22000, 30000, "clean"],
    [15000, 30000, "clean"],
    [6000, 30000, "salvage_title"],
    [2680, 12000, "repairable"],
  ])(
    "retains condition-aware thresholds (%s / %s / %s)",
    (ask, expected, condition) => {
      expect(checkPriceSanity(ask, expected, condition).status).toBe("ok");
    },
  );
  it.each([
    [NaN, 30000],
    [3000, Infinity],
    [Infinity, 30000],
    [0, 30000],
  ])(
    "does not manufacture an outlier from invalid inputs (%s / %s)",
    (ask, expected) =>
      expect(checkPriceSanity(ask, expected).reason).toBeUndefined(),
  );
});
