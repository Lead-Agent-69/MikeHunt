import { describe, expect, it } from "vitest";
import {
  integritySummary,
  normalizeIntegrity,
  normalizeVin,
  priceKind,
  vehicleIdentity,
} from "./listing-integrity";
import { QualityController } from "./tools/quality-control";
describe("listing integrity", () => {
  it("rejects nonfinite values and retains impossible years with a scoring-exclusion flag", () => {
    for (const ask_price of [NaN, Infinity, -Infinity])
      expect(
        new QualityController().validateBatch("test", [
          { source: "test", title: "Honda Accord", ask_price },
        ]).valid,
      ).toBe(0);
    const flagged = new QualityController().validateBatch("test", [
      { source: "test", title: "Honda Accord", ask_price: 1000, year: 2050 },
    ]);
    expect(flagged.valid).toBe(1);
    expect(flagged.issues).toContainEqual({
      index: 0,
      field: "year_after_next_model_year",
      reason: "flagged, kept out of scoring",
    });
  });
  it("normalizes VINs, retains offers, and separates conflicting identity", () => {
    const row = {
      source: "test",
      title: "Honda Accord",
      ask_price: 12000,
      vin: "1hgcm82633a123456",
      make: "HONDA",
      model: "Accord",
      year: 2003,
    };
    expect(normalizeVin(row.vin)).toBe("1HGCM82633A123456");
    expect(vehicleIdentity(row)).toBe(
      vehicleIdentity({ ...row, make: "Honda", vin: row.vin.toUpperCase() }),
    );
    expect(vehicleIdentity(row)).not.toBe(
      vehicleIdentity({ ...row, year: 2004 }),
    );
    expect(
      new QualityController().validateBatch("test", [
        { ...row, source_deal_id: "a" },
        { ...row, source_deal_id: "b" },
      ]).valid,
    ).toBe(2);
    expect(normalizeVin("IOQCM82633A1234567")).toBeNull();
  });
  it("keeps real low bids and treats odometer sentinels as unknown", () => {
    const row = {
      source: "copart",
      title: "Honda Accord",
      ask_price: 1,
      mileage: 999999,
    };
    expect(new QualityController().validateBatch("copart", [row]).valid).toBe(
      1,
    );
    expect(normalizeIntegrity(row).mileage).toBeUndefined();
    expect(priceKind(row)).toBe("bid");
    expect(
      integritySummary({ title: "$450 per month", ask_price: 450 })
        .valuationEligible,
    ).toBe(false);
  });
});
