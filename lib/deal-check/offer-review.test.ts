import { describe, expect, it } from "vitest";
import { offerSchema, reviewOffer } from "./offer-review";
describe("offer cost arithmetic", () => {
  it("does not count explicitly included document fees twice", () => {
    const offer = offerSchema.parse({
      selling_price: 18000,
      fees: [{ name: "Administration (already included)", amount: 300 }],
      taxes: 1200,
      total_out_the_door: 19200,
    });
    expect(reviewOffer(offer).difference).toBe(0);
    expect(reviewOffer(offer).sum).toBe(19200);
  });
  it("reconciles the offer independently of contradictory AI observations", () => {
    const offer = offerSchema.parse({
      selling_price: 18000,
      fees: [{ name: "Documentation", amount: 300 }],
      taxes: 1200,
      total_out_the_door: 19500,
      red_flags: ["Math discrepancy (reconciles correctly)"],
    });
    expect(reviewOffer(offer)).toEqual({
      sum: 19500,
      difference: 0,
      incomplete: false,
    });
  });
  it("retains missing amounts and legitimate zero without inventing a completed quote", () => {
    expect(reviewOffer(offerSchema.parse({ selling_price: 0 }))).toEqual({
      sum: 0,
      difference: null,
      incomplete: true,
    });
    expect(
      reviewOffer(
        offerSchema.parse({
          selling_price: 10.1,
          taxes: 0.2,
          total_out_the_door: 10.4,
        }),
      ).difference,
    ).toBe(0.1);
  });
  it.each([
    { fees: {} },
    { selling_price: "bad" },
    { taxes: -1 },
    { red_flags: [12] },
  ])("rejects invalid extracted shapes %s", (offer) => {
    expect(offerSchema.safeParse(offer).success).toBe(false);
  });
});
