import { describe, it, expect } from "vitest";
import { carCategories } from "./deal-categories";

describe("carCategories", () => {
  it("tags a profitable auction salvage BUY across the right slices", () => {
    const cats = carCategories({
      askPrice: 8000,
      sellEstimate: 15000,
      true_net_profit: 4000,
      dealVerdict: "go",
      condition: "salvage",
      damageType: "front end",
      source: "copart",
      mileage: 40000,
      year: 2022,
    });
    expect(cats).toEqual(
      expect.arrayContaining([
        "high_margin",
        "below_market",
        "salvage_steal",
        "auction",
        "low_miles",
      ]),
    );
  });

  it("does not tag a fairly-priced clean retail car as below_market or salvage", () => {
    const cats = carCategories({
      askPrice: 14500,
      sellEstimate: 15000,
      true_net_profit: 200,
      dealVerdict: "hold",
      condition: "clean",
      source: "carvana",
      mileage: 90000,
      year: 2015,
    });
    expect(cats).not.toContain("below_market");
    expect(cats).not.toContain("salvage_steal");
    expect(cats).not.toContain("high_margin");
  });
});
