import { expect, it } from "vitest";
import { eligibleAskingPrices } from "./asking-price-context";

const retail = {
  source: "independent_dealer",
  ask_price: 28000,
  price_evidence: { kind: "asking", askingPrice: 28000 },
  last_seen_at: new Date().toISOString(),
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
      [0, -1, null, "invalid", NaN, Infinity].map((ask_price) => ({
        ...retail,
        ask_price,
        price_evidence: { kind: "asking", askingPrice: ask_price },
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

it("normalizes the confirmed cash price without mutating the advertised amount", () => {
  const row = { ...retail, ask_price: 299 };
  expect(eligibleAskingPrices([row])).toEqual([{ ...row, ask_price: 28000 }]);
  expect(row.ask_price).toBe(299);
});
it.each([
  "monthly_payment",
  "down_payment",
  "current_bid",
  "reference",
  "unknown",
])("does not use %s amounts as retail cash context", (kind) => {
  expect(
    eligibleAskingPrices([
      { ...retail, price_evidence: { kind, listedAmount: 28000 } },
    ]),
  ).toEqual([]);
});
it("requires cash meaning, current evidence and a safe source link", () => {
  const expired = new Date(Date.now() - 8 * 86400000).toISOString();
  expect(
    eligibleAskingPrices([
      { ...retail, price_evidence: null },
      { ...retail, last_seen_at: expired },
      {
        ...retail,
        price_evidence: {
          kind: "asking",
          askingPrice: 28000,
          checkedAt: expired,
        },
      },
      { ...retail, listing_description: "Advertised price is a down payment" },
      { ...retail, reference_only: "true" },
      {
        ...retail,
        source_url: "https://user:password@dealer.example/vehicle/1",
      },
    ]),
  ).toEqual([]);
});
