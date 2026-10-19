import { describe, expect, it } from "vitest";
import {
  disclosedPriceEvidence,
  listingPriceEvidence,
  positivePrice,
  reportedAcquisitionPrice,
} from "./acquisition-price";

describe("reported acquisition price", () => {
  it.each([
    { askingPrice: 299, evidenceText: "Sale price: $299/month" },
    { askingPrice: 2180, evidenceText: "Savings off sale price: $2,180" },
    { askingPrice: 2600, evidenceText: "Not the cash price: $2,600" },
  ])(
    "rechecks legacy asking-price evidence without rewriting the stored listing: %j",
    (evidence) => {
      const row = {
        ask_price: evidence.askingPrice,
        options: { priceEvidence: { kind: "asking", ...evidence } },
      };
      expect(reportedAcquisitionPrice(row)).toBe(0);
      expect(row.options.priceEvidence.kind).toBe("asking");
    },
  );
  it.each([
    "Not the full cash price: $2,600",
    "Not the cash price: $2,600",
    "This is not the sale price: $2,600. Price listed may be down payment.",
    "Sale price: $299/month",
    "Monthly sale price: $299",
    "Savings off sale price: $2,180",
    "Discount on the cash price: $2,180",
  ])(
    "does not promote a qualified price label into purchase math: %s",
    (description) => {
      const amount = description.includes("299")
        ? 299
        : description.includes("2,180")
          ? 2180
          : 2600;
      expect(reportedAcquisitionPrice({ ask_price: amount, description })).toBe(
        0,
      );
    },
  );
  it("skips a negated amount and keeps a later explicit cash price", () => {
    expect(
      reportedAcquisitionPrice({
        ask_price: 2600,
        description: "Not the full cash price: $2,600. Cash price: $15,995",
      }),
    ).toBe(15995);
  });
  it.each([
    { seller_type: "dealer" },
    { sellerType: "Dealer" },
    { options: { sellerType: "dealer" } },
  ])(
    "recognizes dealer listings collected under a shared Craigslist source",
    (seller) => {
      expect(
        reportedAcquisitionPrice({
          source: "craigslist",
          ask_price: 2600,
          ...seller,
        }),
      ).toBe(0);
      expect(
        reportedAcquisitionPrice({
          source: "craigslist",
          seller_type: "private",
          ask_price: 2600,
        }),
      ).toBe(2600);
    },
  );
  it("retains the photographed dealer disclaimer without treating $2600 as cash", () => {
    const description =
      "*** PRICE LISTED MAY BE DOWN PAYMENT AND NOT FULL PRICE CALL DEALER FOR DETAILS ***";
    const row = { source: "craigslist_dealer", ask_price: 2600, description };
    expect(listingPriceEvidence(row)).toMatchObject({
      kind: "down_payment",
      listedAmount: 2600,
    });
    expect(reportedAcquisitionPrice(row)).toBe(0);
  });
  it.each([
    "2600/mo",
    "Down payment: 2,600",
    "Down payment: $2,600",
    "Monthly payment: $2,600",
    "Deposit: $2,600",
    "Not full price: $2,600",
    "$2,600 down",
    "$2600/month",
    "$2600 per month",
    "$2600 a month",
  ])("excludes a payment: %s", (description) => {
    expect(reportedAcquisitionPrice({ ask_price: 2600, description })).toBe(0);
  });
  it("does not invalidate a cash price just because financing is offered", () => {
    expect(
      reportedAcquisitionPrice({
        ask_price: 2600,
        description: "Monthly payment: $299. Down payment: $2,600.",
      }),
    ).toBe(0);
    expect(
      disclosedPriceEvidence(
        "Financing available. $299/month with approved credit",
        15995,
      ),
    ).toBeUndefined();
    expect(
      disclosedPriceEvidence(
        "Buy here pay here. No down payment required",
        15995,
      ),
    ).toBeUndefined();
  });
  it("uses only an explicitly stated full cash price, not a guessed market value", () => {
    expect(
      reportedAcquisitionPrice({
        source: "craigslist_dealer",
        ask_price: 2600,
        description: "$2600 down. Cash price: $15,995",
      }),
    ).toBe(15995);
  });
  it("fails closed for old dealer rows until price terms have been inspected", () => {
    expect(
      reportedAcquisitionPrice({
        source: "craigslist_dealer",
        ask_price: 2600,
      }),
    ).toBe(0);
    expect(
      reportedAcquisitionPrice({
        source: "craigslist_dealer",
        ask_price: 2600,
        options: { priceEvidence: { kind: "asking", askingPrice: 15995 } },
      }),
    ).toBe(15995);
  });
  it("does not leak arbitrary stored evidence fields", () => {
    expect(
      listingPriceEvidence({
        options: { priceEvidence: { kind: "unknown", secret: "private" } },
      }),
    ).not.toHaveProperty("secret");
  });
  it.each([undefined, null, NaN, Infinity, -10, 0, "not a price"])(
    "rejects invalid price %s",
    (value) => {
      expect(positivePrice(value)).toBeUndefined();
    },
  );
  it("does not expose an explicitly marked reference as a bid", () => {
    expect(
      reportedAcquisitionPrice({
        ask_price: 24000,
        metadata: { price_is_acv_estimate: true },
      }),
    ).toBe(0);
    expect(
      reportedAcquisitionPrice({
        ask_price: 24000,
        options: {
          priceEvidence: { kind: "reference", referenceValue: 24000 },
        },
      }),
    ).toBe(0);
  });
  it("does not rescue unknown prices from unrelated fields", () => {
    expect(
      reportedAcquisitionPrice({
        ask_price: 24000,
        options: { priceEvidence: { kind: "unknown" } },
      }),
    ).toBe(0);
  });
  it("respects explicit bid and buy-now provenance", () => {
    expect(
      reportedAcquisitionPrice({
        ask_price: 24000,
        options: {
          priceEvidence: {
            kind: "current_bid",
            currentBid: 3000,
            buyNow: 14000,
          },
        },
      }),
    ).toBe(3000);
    expect(
      reportedAcquisitionPrice({
        options: { priceEvidence: { kind: "buy_now", buyNow: 14000 } },
      }),
    ).toBe(14000);
    expect(
      reportedAcquisitionPrice({
        ask_price: 24000,
        options: { priceEvidence: { kind: "current_bid", currentBid: -1 } },
      }),
    ).toBe(0);
  });
  it("preserves ordinary asking prices", () => {
    expect(reportedAcquisitionPrice({ askPrice: 18000 })).toBe(18000);
    expect(reportedAcquisitionPrice({ ask_price: "18000" })).toBe(18000);
  });
});
