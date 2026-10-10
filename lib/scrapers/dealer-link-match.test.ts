import { describe, expect, it } from "vitest";
import { matchingDealerListing } from "./dealer-link-match";

describe("verified dealer link matching", () => {
  const row = {
    year: 2024,
    make: "Ford",
    model: "Bronco Sport",
    ask_price: 24092,
    mileage: 52621,
  };
  const match = { ...row, source_url: "https://dealer.example/cars/123" };
  it("requires exact identity, price and mileage when VIN is absent", () => {
    expect(matchingDealerListing(row, [match])).toEqual(match);
    for (const candidate of [
      { ...match, model: "Bronco" },
      { ...match, mileage: 52622 },
      { ...match, ask_price: 24093 },
      { ...match, year: 2023 },
    ])
      expect(matchingDealerListing(row, [candidate])).toBeNull();
    expect(
      matchingDealerListing({ ...row, mileage: undefined }, [match]),
    ).toBeNull();
  });
  it("refuses ambiguous vehicles but ignores duplicate copies of the same URL", () => {
    expect(
      matchingDealerListing(row, [
        match,
        { ...match, source_url: "https://dealer.example/cars/456" },
      ]),
    ).toBeNull();
    expect(matchingDealerListing(row, [match, match])).toEqual(match);
  });
  it("uses an exact VIN when both records supply it", () => {
    const vin = "3FMCR9B60RRE12345";
    expect(
      matchingDealerListing({ ...row, vin }, [
        { ...match, vin, ask_price: 25000 },
      ])?.source_url,
    ).toBe(match.source_url);
    expect(
      matchingDealerListing({ ...row, vin }, [
        { ...match, vin: "3FMCR9B60RRE54321" },
      ]),
    ).toBeNull();
  });
});
