import { expect, it } from "vitest";
import { parseTrueCarHtml } from "./truecar";
import { parseAutotraderNextData } from "./autotrader";
import { parseOfferUpHtml } from "./offerup";
import { parseCarvanaVehicles } from "./carvana";
import { ingestCondition } from "../pipeline";

const nextPage = (props: unknown) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script>`;

it.each([undefined, null, "", 0, "60,000 miles"])(
  "TrueCar retains odometer meaning (%s) without assuming a clean title",
  (mileage) => {
    const html = nextPage({
      apollo: {
        "ConsumerSummaryListing:1": {
          vehicle: {
            vin: "1HGCV1F30LA000000",
            year: 2020,
            make: "Honda",
            model: "Accord",
            mileage,
          },
          pricing: { listPrice: "$28,000.00" },
        },
      },
    });
    const [row] = parseTrueCarHtml(html);
    expect(row.ask_price).toBe(28000);
    expect(row.mileage).toBe(
      mileage === 0 ? 0 : mileage === "60,000 miles" ? 60000 : undefined,
    );
    expect(ingestCondition(row).condition).toBeNull();
  },
);

it("preserves CPO as a program on TrueCar and AutoTrader without assigning a title brand", () => {
  const [tc] = parseTrueCarHtml(
    nextPage({
      apollo: {
        "ConsumerSummaryListing:1": {
          vehicle: { vin: "X", certifiedPreOwned: true },
          pricing: { listPrice: 28000 },
        },
      },
    }),
  );
  const [at] = parseAutotraderNextData(
    nextPage({
      __eggsState: {
        inventory: {
          1: {
            vin: "X",
            listingType: "CERTIFIED",
            pricingDetail: { displayPrice: 28000 },
          },
        },
      },
    }),
  );
  for (const row of [tc, at]) {
    expect(row.options?.vehicleCondition).toBe("cpo");
    expect(ingestCondition(row).condition).toBeNull();
  }
});

it("AutoTrader parses decimal prices and leaves absent mileage unknown", () => {
  const [row] = parseAutotraderNextData(
    nextPage({
      __eggsState: {
        inventory: {
          1: {
            vin: "X",
            listingType: "USED",
            pricingDetail: { displayPrice: "$28,000.00" },
          },
        },
      },
    }),
  );
  expect(row.ask_price).toBe(28000);
  expect(row.mileage).toBeUndefined();
  expect(ingestCondition(row).condition).toBeNull();
});

it("Carvana does not manufacture zero mileage from missing data", () => {
  const rows = parseCarvanaVehicles({
    inventory: {
      vehicles: [
        { vehicleId: 1, vin: "VIN", price: { total: 28000 } },
        { vehicleId: 2, vin: "VIN2", price: { total: 28000 }, mileage: 0 },
      ],
    },
  });
  expect(rows).toHaveLength(2);
  expect(rows[0].mileage).toBeUndefined();
  expect(rows[1].mileage).toBe(0);
});

it("OfferUp preserves title-brand differences instead of treating every damage phrase as salvage", () => {
  const rows = parseOfferUpHtml(
    nextPage({
      searchFeedResponse: {
        looseTiles: [
          "2020 Honda Accord",
          "2020 Honda Accord rebuilt title",
          "2020 Honda Accord parts only",
          "2020 Honda Accord not running",
        ].map((title, index) => ({
          tileType: "LISTING",
          listing: { listingId: index + 1, title, price: 5000 },
        })),
      },
    }),
  );
  expect(rows.map((row) => row.condition)).toEqual([
    undefined,
    "rebuilt_title",
    "parts_only",
    undefined,
  ]);
  expect(rows.every((row) => row.mileage === undefined)).toBe(true);
});
