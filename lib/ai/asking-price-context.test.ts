import { expect, it } from "vitest";
import { eligibleAskingPrices } from "./asking-price-context";

const retail = {
  source: "independent_dealer",
  ask_price: 28000,
  mileage: 40000,
  condition: "clean_title",
  source_url: "https://dealer.example/vehicle/1",
};

it("excludes auction, mixed and unknown amounts from asking-price context", () => {
  const rows = [
    "copart",
    "iaa",
    "gov_auction",
    "manheim",
    "ebay_motors",
    "unknown",
    "auction_cars",
    "",
    "independent_dealer",
    "cars_com",
  ].map((source) => ({ ...retail, source, ask_price: 3000 }));
  expect(eligibleAskingPrices(rows).map((row) => row.source)).toEqual([
    "independent_dealer",
    "cars_com",
  ]);
});
it("rejects missing, nonpositive and malformed numeric amounts", () => {
  expect(
    eligibleAskingPrices(
      [0, -1, null, "3000", NaN, Infinity].map((ask_price) => ({
        ...retail,
        ask_price,
      })),
    ),
  ).toEqual([]);
});

it("rejects auction brokers mislabeled as independent dealers", () => {
  expect(
    eligibleAskingPrices([
      {
        ...retail,
        source_url: "https://www.salvagetrucksauction.com/trucks-for-sale/1",
      },
      { ...retail, source_url: "https://dealer.example/auction/1" },
      { ...retail, auction_end_at: "2026-10-10T00:00:00Z" },
      { ...retail, source_url: null },
    ]),
  ).toEqual([]);
});

it("keeps damaged, history-branded and incomplete evidence out of retail context", () => {
  expect(
    eligibleAskingPrices([
      { ...retail, condition: "salvage_title" },
      { ...retail, damage_type: "FRONT END" },
      { ...retail, title: "Clean title total-loss history" },
      { ...retail, condition: "unknown" },
      { ...retail, mileage: null },
      retail,
    ]),
  ).toEqual([retail]);
});
