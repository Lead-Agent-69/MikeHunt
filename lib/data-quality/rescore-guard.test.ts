import { describe, expect, it } from "vitest";
import { rescoreSkipReasons, shouldSkipRescore } from "./rescore-guard";

const now = new Date("2026-10-10T12:00:00Z");
const clean = {
  ask_price: 8500,
  mileage: 92000,
  year: 2016,
  vin: null,
  make: "Honda",
  source: "craigslist",
};

describe("rescore guard (Ren #306 P2)", () => {
  it("allows a clean row", () => {
    expect(shouldSkipRescore({ ...clean, quality_flags: null }, now)).toBe(false);
    expect(shouldSkipRescore({ ...clean, quality_flags: [] }, now)).toBe(false);
  });

  it("skips a row whose stored quality_flags is non-empty, even if it looks clean now", () => {
    expect(
      rescoreSkipReasons({ ...clean, quality_flags: ["vin_check_digit"] }, now),
    ).toEqual(["vin_check_digit"]);
  });

  it("skips a row the pure check flags before the column is applied", () => {
    expect(shouldSkipRescore({ ...clean, mileage: 950000 }, now)).toBe(true);
    expect(shouldSkipRescore({ ...clean, year: 2031 }, now)).toBe(true);
    expect(shouldSkipRescore({ ...clean, ask_price: 50 }, now)).toBe(true);
  });

  it("does not flag a live auction bid under $300", () => {
    expect(
      shouldSkipRescore({ ...clean, ask_price: 150, source: "copart" }, now),
    ).toBe(false);
  });
});
