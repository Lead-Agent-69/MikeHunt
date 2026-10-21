import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { dealerDetailPriceEvidence } from "./dealer-detail";
import { cardToDeal, dealerCmsSiteFor } from "./dealer-cms";
const vin = "1FT7W2BT3NEC06696";
const observedAt = "2026-10-20T12:00:00Z";
const deal = { title: "2022 Ford F250 Platinum", vin, ask_price: 999 };
const parse = (
  description: string,
  html = "",
  car = { vehicleIdentificationNumber: vin },
) =>
  dealerDetailPriceEvidence(
    load(html),
    deal,
    { ...car, description },
    observedAt,
  );
describe("dealer detail price verification", () => {
  it("preserves the native inventory card's own source observation date", () => {
    const row = cardToDeal(
      {
        id: "car",
        url: "https://dgautollc.com/car/",
        title: "2022 Ford F250",
        price: 18000,
        sold: false,
      },
      dealerCmsSiteFor("https://dgautollc.com/")!,
      observedAt,
    );
    expect(row?.options?.priceEvidence).toMatchObject({
      kind: "asking",
      askingPrice: 18000,
      checkedAt: observedAt,
    });
    expect(
      dealerDetailPriceEvidence(
        load(""),
        { ...row!, vin },
        { vehicleIdentificationNumber: vin },
        "2026-10-21T12:00:00Z",
      ),
    ).toBeUndefined();
  });
  it("uses the matched car's explicit cash price and actual source observation time", () => {
    expect(parse("Down payment $999. Cash price $18,000.")).toMatchObject({
      kind: "asking",
      askingPrice: 18000,
      listedAmount: 999,
      checkedAt: observedAt,
    });
  });
  it.each([
    ["$999 down", "down_payment"],
    ["$999/mo", "monthly_payment"],
    ["MSRP $999", "reference"],
  ])("keeps %s out of cash comparisons", (text, kind) => {
    expect(parse(text)).toMatchObject({ kind });
  });
  it("does not treat a generic structured offer or an unlabelled number as cash proof", () => {
    expect(
      dealerDetailPriceEvidence(
        load(""),
        deal,
        { vehicleIdentificationNumber: vin, offers: { price: 999 } },
        observedAt,
      ),
    ).toMatchObject({ kind: "unknown" });
  });
  it("rejects mismatched vehicle identities and responses without an observation time", () => {
    expect(
      parse("Cash price $18,000", "", {
        vehicleIdentificationNumber: "1HGCM82633A004352",
      }),
    ).toBeUndefined();
    expect(
      dealerDetailPriceEvidence(load(""), deal, {
        vehicleIdentificationNumber: vin,
        description: "Cash price $18,000",
      }),
    ).toBeUndefined();
  });
  it("matches a no-VIN detail heading and excludes related cars' price fields", () => {
    const $ = load(
      '<h1>2022 Ford F250 Platinum</h1><div class="related"><dt>Sale Price</dt><dd>$1,000</dd></div><dt>Sale Price</dt><dd>$18,000</dd>',
    );
    expect(
      dealerDetailPriceEvidence(
        $,
        { title: deal.title, ask_price: 18000 },
        {},
        observedAt,
      ),
    ).toMatchObject({ kind: "asking", askingPrice: 18000 });
    expect(
      dealerDetailPriceEvidence(
        load("<h1>2020 Honda Civic</h1>"),
        { title: deal.title },
        {},
        observedAt,
      ),
    ).toBeUndefined();
  });
  it("fails closed when the matched detail discloses conflicting cash prices", () => {
    expect(parse("Cash price $18,000. Sale price $22,000.")).toMatchObject({
      kind: "unknown",
    });
    expect(parse("Not the full price $999.")).not.toMatchObject({
      kind: "asking",
    });
  });
  it("reads an explicit all-in field without treating savings as the purchase price", () => {
    expect(
      parse(
        "",
        "<dt>All In Price</dt><dd>$19,520</dd><dt>Savings</dt><dd>$2,180</dd>",
      ),
    ).toMatchObject({ kind: "asking", askingPrice: 19520 });
  });
});
