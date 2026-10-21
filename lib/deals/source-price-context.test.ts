import { describe, expect, it } from "vitest";
import {
  sourcePriceContext,
  type SourcePriceRow,
} from "./source-price-context";
const now = Date.parse("2026-10-13T00:00:00Z");
const row = (fields: Partial<SourcePriceRow> = {}): SourcePriceRow => ({
  source: "independent_dealer",
  source_url: "https://seller.example/car/1",
  ask_price: 15000,
  price_evidence: { kind: "asking", askingPrice: 15000 },
  last_seen_at: new Date(now - 86400000).toISOString(),
  title: "clean",
  condition: "excellent",
  mileage: 50000,
  ...fields,
});
describe("cross-source price meaning", () => {
  it("uses the stated cash price instead of a teaser", () => {
    expect(sourcePriceContext(row({ ask_price: 999 }), now)).toMatchObject({
      amount: 15000,
      advertisedAmount: 999,
      cashPrice: 15000,
      comparisonEligible: true,
      canCompareToAskingCurve: true,
    });
  });
  it.each([
    "down_payment",
    "monthly_payment",
    "finance_teaser",
    "reference",
    "unknown",
  ])("preserves %s without cash math", (kind) => {
    expect(
      sourcePriceContext(
        row({ ask_price: 500, price_evidence: { kind, listedAmount: 500 } }),
        now,
      ),
    ).toMatchObject({
      amount: 500,
      cashPrice: null,
      comparisonEligible: false,
      canCompareToAskingCurve: false,
    });
  });
  it("does not plot a bid, even with buy-now available", () => {
    expect(
      sourcePriceContext(
        row({
          source: "copart",
          ask_price: 500,
          price_evidence: { kind: "current_bid", currentBid: 500 },
          buy_now_price: 18000,
        }),
        now,
      ),
    ).toMatchObject({
      kind: "current_bid",
      amount: 500,
      cashPrice: 18000,
      buyNowPrice: 18000,
      comparisonEligible: true,
      canCompareToAskingCurve: false,
    });
  });
  it("does not turn zero bids into free vehicles", () => {
    expect(
      sourcePriceContext(
        row({ source: "copart", ask_price: 0, price_evidence: null }),
        now,
      ),
    ).toMatchObject({
      amount: null,
      cashPrice: null,
      comparisonEligible: false,
    });
  });
  it.each([null, { kind: "asking" }])(
    "does not invent missing price evidence: %j",
    (price_evidence) => {
      expect(sourcePriceContext(row({ price_evidence }), now)).toMatchObject({
        kind: "unknown",
        amount: 15000,
        cashPrice: null,
      });
    },
  );
  it("checks stated payment terms ahead of conflicting stored cash evidence", () => {
    expect(
      sourcePriceContext(
        row({
          ask_price: 500,
          listing_description:
            "The advertised price is a down payment and not the full price.",
        }),
        now,
      ),
    ).toMatchObject({ kind: "down_payment", cashPrice: null });
  });
  it.each([null, "invalid", "2026-01-01", "2027-01-01"])(
    "excludes stale/missing/future observation %s",
    (last_seen_at) => {
      expect(sourcePriceContext(row({ last_seen_at }), now)).toMatchObject({
        amount: 15000,
        comparisonEligible: false,
        canCompareToAskingCurve: false,
      });
    },
  );
  it.each([
    "javascript:alert(1)",
    "https://user:secret@seller.example/car",
    "invalid",
  ])("excludes unsafe links %s", (source_url) => {
    expect(
      sourcePriceContext(row({ source_url }), now).comparisonEligible,
    ).toBe(false);
  });
  it.each([
    { condition: "salvage" },
    { damage_type: "front end" },
    { mileage: 0 },
    { title: "rebuilt" },
    { listing_title: "rebuilt title" },
    { condition: "unknown" },
  ])(
    "does not compare incomplete or repairable vehicles to retail asks: %j",
    (fields) => {
      expect(sourcePriceContext(row(fields), now)).toMatchObject({
        cashPrice: 15000,
        canCompareToAskingCurve: false,
      });
    },
  );
  it("honors reference-only flags", () => {
    expect(
      sourcePriceContext(row({ reference_only: "true" }), now),
    ).toMatchObject({ kind: "reference", cashPrice: null });
  });
  it.each(["", "invalid", "2026-01-01", "2027-01-01"])(
    "excludes supplied stale/invalid price-check date %s",
    (checkedAt) => {
      expect(
        sourcePriceContext(
          row({
            price_evidence: { kind: "asking", askingPrice: 15000, checkedAt },
          }),
          now,
        ).comparisonEligible,
      ).toBe(false);
    },
  );
});

describe("price observation integrity", () => {
  it.each(["", "invalid", "2026-01-01", "2027-01-01", 123])(
    "does not refresh a saved check date by reparsing cash terms: %s",
    (checkedAt) => {
      expect(
        sourcePriceContext(
          row({
            listing_description: "Cash price: $15,000",
            price_evidence: { kind: "asking", askingPrice: 15000, checkedAt },
          }),
          now,
        ),
      ).toMatchObject({ cashPrice: 15000, comparisonEligible: false });
    },
  );
  it("retains an old timestamp when reclassifying misleading stored cash evidence", () => {
    expect(
      sourcePriceContext(
        row({
          price_evidence: {
            kind: "asking",
            askingPrice: 299,
            checkedAt: "2026-01-01",
            evidenceText: "Sale price: $299/month",
          },
        }),
        now,
      ),
    ).toMatchObject({ kind: "monthly_payment", comparisonEligible: false });
  });
  it.each(["2026-10-12T23:59:59Z", "2026-10-13T00:00:00Z", "invalid"])(
    "retains an unavailable auction amount without including it in comparisons: %s",
    (auction_end_at) => {
      expect(
        sourcePriceContext(
          row({
            source: "copart",
            auction_end_at,
            buy_now_price: 18000,
            price_evidence: { kind: "current_bid", currentBid: 500 },
          }),
          now,
        ),
      ).toMatchObject({
        amount: 500,
        cashPrice: 18000,
        comparisonEligible: false,
        observationCurrent: false,
      });
    },
  );
  it("excludes week-old snapshots from current comparisons without hiding the amount", () => {
    expect(
      sourcePriceContext(
        row({ last_seen_at: new Date(now - 8 * 86400000).toISOString() }),
        now,
      ),
    ).toMatchObject({
      amount: 15000,
      comparisonEligible: false,
      observationCurrent: false,
    });
  });
  it("does not call a stale observation live just because it can supply recent comparison context", () => {
    expect(
      sourcePriceContext(
        row({ last_seen_at: new Date(now - 4 * 86400000).toISOString() }),
        now,
      ),
    ).toMatchObject({
      amount: 15000,
      comparisonEligible: true,
      observationCurrent: false,
    });
  });
});
