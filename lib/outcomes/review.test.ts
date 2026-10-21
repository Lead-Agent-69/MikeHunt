import { describe, expect, it } from "vitest";
import { completeSale } from "./ledger.fixture";
import { outcomeReviewItems } from "./review";
import {
  canCapturePurchasePrediction,
  predictionPrecedesPurchase,
} from "./prediction-timing";

describe("actual outcome review", () => {
  it("accepts reviewed zero expenses and a zero-dollar sale", () => {
    expect(
      outcomeReviewItems(completeSale({ sell_price: 0, actual_recon: 0 })),
    ).toEqual([]);
  });
  it("identifies missing expenses without treating unknown amounts as zero", () => {
    expect(
      outcomeReviewItems(
        completeSale({
          actual_recon: null,
          actual_other: null,
          costs_complete: false,
        }),
      ),
    ).toEqual([
      { field: "actual_recon", label: "Repair and preparation" },
      { field: "actual_other", label: "Other actual costs" },
      { field: "costs_complete", label: "Review dates and actual expenses" },
    ]);
  });
  it("points to missing or invalid dates and unfinished purchases", () => {
    expect(
      outcomeReviewItems(
        completeSale({ purchased_at: null, sold_at: null }),
      ).map((i) => i.field),
    ).toEqual(["purchased_at", "sold_at"]);
    expect(
      outcomeReviewItems(completeSale({ sold_at: "2026-08-01" })).map(
        (i) => i.field,
      ),
    ).toContain("sold_at");
    expect(
      outcomeReviewItems(completeSale({ sell_price: null, sold_at: null })).map(
        (i) => i.field,
      ),
    ).toEqual(["sell_price", "sold_at"]);
  });
  it("captures only a dated purchase recorded today", () => {
    const now = Date.parse("2026-10-21T12:00:00Z");
    expect(canCapturePurchasePrediction("2026-10-21", now)).toBe(true);
    for (const value of [null, "bad", "2026-10-20", "2026-10-22"])
      expect(canCapturePurchasePrediction(value, now)).toBe(false);
  });
  it("rejects later-day snapshots while accepting date-only purchase records", () => {
    expect(
      predictionPrecedesPurchase("2026-09-01", "2026-09-01T12:00:00Z"),
    ).toBe(true);
    expect(
      predictionPrecedesPurchase("2026-09-01", "2026-09-02T12:00:00Z"),
    ).toBe(false);
    expect(predictionPrecedesPurchase(null, "2026-09-01")).toBe(false);
  });
});
