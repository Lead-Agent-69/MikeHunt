import { describe, expect, it } from "vitest";
import { positivePrice, reportedAcquisitionPrice } from "./acquisition-price";

describe("reported acquisition price", () => {
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
