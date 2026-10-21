import { describe, expect, it } from "vitest";
import { listingHash } from "./local-cache";
const row = (checkedAt: string, askingPrice = 18000, kind = "asking") => ({
  source: "independent_dealer",
  ask_price: askingPrice,
  options: { priceEvidence: { kind, askingPrice, checkedAt } },
});
describe("price evidence observation write budget", () => {
  it("deduplicates same-day observations without modifying the actual source timestamp", () => {
    const first = row("2026-10-21T01:00:00Z"),
      next = row("2026-10-21T20:00:00Z");
    expect(listingHash(first)).toBe(listingHash(next));
    expect(next.options.priceEvidence.checkedAt).toBe("2026-10-21T20:00:00Z");
  });
  it("refreshes evidence on a later UTC day and distinguishes missing or invalid dates", () => {
    const first = listingHash(row("2026-10-21T01:00:00Z"));
    expect(first).not.toBe(listingHash(row("2026-10-22T01:00:00Z")));
    expect(first).not.toBe(listingHash(row("invalid")));
    expect(first).not.toBe(
      listingHash({
        source: "independent_dealer",
        ask_price: 18000,
        options: { priceEvidence: { kind: "asking", askingPrice: 18000 } },
      }),
    );
  });
  it("always saves changed amounts or meaning even within one day", () => {
    const first = listingHash(row("2026-10-21T01:00:00Z"));
    expect(first).not.toBe(listingHash(row("2026-10-21T20:00:00Z", 20000)));
    expect(first).not.toBe(
      listingHash(row("2026-10-21T20:00:00Z", 18000, "down_payment")),
    );
  });
  it("does not normalize unrelated checkedAt fields", () => {
    expect(
      listingHash({
        options: { other: { checkedAt: "2026-10-21T01:00:00Z" } },
      }),
    ).not.toBe(
      listingHash({
        options: { other: { checkedAt: "2026-10-21T20:00:00Z" } },
      }),
    );
  });
});
