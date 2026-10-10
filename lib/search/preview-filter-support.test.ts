import { describe, expect, it } from "vitest";
import { unsupportedPreviewFilters } from "./preview-filter-support";

describe("public preview filter support", () => {
  it("allows verified basic filters", () => {
    expect(
      unsupportedPreviewFilters(
        new URLSearchParams(
          "state=MO&make=Ford&model=Explorer&maxYear=2020&maxMileage=90000",
        ),
      ),
    ).toEqual([]);
  });
  it("allows inactive controls without blocking previews", () => {
    expect(
      unsupportedPreviewFilters(
        new URLSearchParams(
          "damage=all&minProfit=any&buyNow=0&madeInUsa=false",
        ),
      ),
    ).toEqual([]);
  });
  it.each([
    "damage=flood",
    "fuelType=Electric",
    "buyNow=1",
    "verdict=GO",
    "dealers=example.com",
    "dealerSourceIds=ae-of-miami",
  ])(
    "discloses unsupported eligibility instead of ignoring it (%s)",
    (query) => {
      expect(
        unsupportedPreviewFilters(new URLSearchParams(query)),
      ).toHaveLength(1);
    },
  );
});
