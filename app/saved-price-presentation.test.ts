import { describe, expect, it } from "vitest";
import { savedPricePresentation } from "@/lib/saved/price-presentation";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";

describe("device saved price presentation", () => {
  it.each([undefined, null, 0, -1, NaN, Infinity, "", {}, 0.1])(
    "does not invent a zero-dollar vehicle from %j",
    (value) => {
      expect(savedPricePresentation(value)).toEqual({
        label: "Unverified advertised amount",
        amount: "Not reported",
      });
    },
  );
  it("keeps legacy prices explicitly unverified", () => {
    expect(savedPricePresentation(8900)).toEqual({
      label: "Unverified advertised amount",
      amount: "$8,900",
    });
  });
  it.each([
    [{ kind: "asking", askingPrice: 20000 }, "Asking price", "$20,000"],
    [{ kind: "current_bid", currentBid: 7500 }, "Current bid", "$7,500"],
    [{ kind: "buy_now", buyNow: 12000 }, "Buy-now price", "$12,000"],
    [
      { kind: "down_payment", listedAmount: 2180 },
      "Possible down payment",
      "$2,180",
    ],
    [{ kind: "monthly_payment", listedAmount: 450 }, "Monthly payment", "$450"],
    [{ kind: "finance_teaser", listedAmount: 500 }, "Payment amount", "$500"],
    [
      { kind: "reference", referenceValue: 22000 },
      "Reference value",
      "$22,000",
    ],
  ] as [PriceEvidence, string, string][])(
    "preserves %j without treating it as a different price type",
    (evidence, label, amount) => {
      expect(savedPricePresentation(0, evidence)).toEqual({ label, amount });
    },
  );
  it("does not substitute a market estimate when a bid is missing", () => {
    expect(savedPricePresentation(0, { kind: "current_bid" })).toEqual({
      label: "Current bid",
      amount: "Not reported",
    });
  });
});
