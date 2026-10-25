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
  const riverbend = {
    title: "2020 Jeep Gladiator",
    year: 2020,
    make: "Jeep",
    model: "Gladiator",
    ask_price: 24700,
    source_url: "https://www.riverbendrebuildables.com/2020-jeep-gladiator/",
  };
  const nativePanel = (amount = "$24,700", description = "") =>
    `<div class="page-product"><h1>2020 Jeep Gladiator</h1><div class="page-product__price"><div><span class="current">${amount}</span></div></div><p>${description}</p></div>`;
  it("reads Riverbend's matched native asking-price panel without inventing all-in costs", () => {
    expect(
      dealerDetailPriceEvidence(load(nativePanel()), riverbend, {}, observedAt),
    ).toMatchObject({
      kind: "asking",
      askingPrice: 24700,
      checkedAt: observedAt,
      evidenceText: expect.stringContaining("fees not confirmed"),
    });
  });
  it.each([
    [
      "$2,600",
      "Price listed may be down payment and not full price",
      "down_payment",
    ],
    ["$499", "$499/mo", "monthly_payment"],
    ["$2,180", "Savings $2,180", "reference"],
    ["$24,700", "Starting from this amount", "unknown"],
    ["$24,700", "Cash price $28,000", "unknown"],
    ["$24,700 - $28,000", "", "unknown"],
  ])(
    "does not turn a qualified native amount into a cash price (%s, %s)",
    (amount, description, kind) => {
      expect(
        dealerDetailPriceEvidence(
          load(nativePanel(amount, description)),
          riverbend,
          {},
          observedAt,
        )?.kind,
      ).toBe(kind);
    },
  );
  it("requires the exact source, matching product identity, one price panel, and a dated observation", () => {
    for (const source_url of [
      "https://elsewhere.test/car/",
      "https://riverbendrebuildables.com.evil.test/car/",
      "https://user:pass@riverbendrebuildables.com/car/",
    ])
      expect(
        dealerDetailPriceEvidence(
          load(nativePanel()),
          { ...riverbend, source_url },
          {},
          observedAt,
        )?.kind,
      ).toBe("unknown");
    expect(
      dealerDetailPriceEvidence(
        load(nativePanel().replace("2020 Jeep Gladiator", "2021 Ford F250")),
        riverbend,
        {},
        observedAt,
      ),
    ).toBeUndefined();
    expect(
      dealerDetailPriceEvidence(
        load(
          nativePanel().replace(
            "</p>",
            '</p><div class="page-product__price"><span class="current">$2,180</span></div>',
          ),
        ),
        riverbend,
        {},
        observedAt,
      )?.kind,
    ).toBe("unknown");
    expect(
      dealerDetailPriceEvidence(load(nativePanel()), riverbend, {}),
    ).toBeUndefined();
    expect(
      dealerDetailPriceEvidence(
        load(nativePanel()),
        { ...riverbend, vin },
        { vehicleIdentificationNumber: "1HGCM82633A004352" },
        observedAt,
      ),
    ).toBeUndefined();
  });
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
