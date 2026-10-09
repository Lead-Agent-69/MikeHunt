import { expect, it } from "vitest";
import { eligibleAskingPrices } from "./asking-price-context";

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
  ].map((source) => ({ source, ask_price: 3000 }));
  expect(eligibleAskingPrices(rows).map((row) => row.source)).toEqual([
    "independent_dealer",
    "cars_com",
  ]);
});
it("rejects missing, nonpositive and malformed numeric amounts", () => {
  expect(
    eligibleAskingPrices(
      [0, -1, null, "3000", NaN, Infinity].map((ask_price) => ({
        source: "independent_dealer",
        ask_price,
      })),
    ),
  ).toEqual([]);
});
