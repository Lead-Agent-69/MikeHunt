import { describe, it, expect } from "vitest";
import { QualityController } from "./quality-control";

describe("QualityController", () => {
  it("validates a good batch", () => {
    const qc = new QualityController();
    const report = qc.validateBatch("test", [
      { source: "test", title: "2019 Honda Accord", ask_price: 12000 },
      { source: "test", title: "2020 Toyota Camry", ask_price: 15000 },
    ]);
    expect(report.score).toBe(100);
    expect(report.validDeals.length).toBe(2);
  });

  it("rejects invalid deals", () => {
    const qc = new QualityController();
    const report = qc.validateBatch("test", [
      { source: "test", title: "", ask_price: 12000 },
      { source: "test", title: "Bad price", ask_price: -5 },
      { source: "test", title: "Too old", ask_price: 1000, year: 1800 },
    ]);
    expect(report.valid).toBe(0);
    expect(report.invalid).toBe(3);
    expect(report.validDeals.length).toBe(0);
  });

  it("keeps implausible-but-parseable values for the sanity flags instead of dropping them", () => {
    const qc = new QualityController();
    const report = qc.validateBatch("test", [
      { source: "test", title: "$50 teaser", ask_price: 50 },
      { source: "test", title: "Future car", ask_price: 9000, year: 2050 },
      { source: "test", title: "Short VIN", ask_price: 9000, vin: "ABC123" },
      {
        source: "test",
        title: "Odometer typo",
        ask_price: 9000,
        mileage: 9_999_999,
      },
      { source: "test", title: "Supercar", ask_price: 2_500_000 },
    ]);
    expect(report.valid).toBe(5);
  });

  it("detects duplicates within a batch", () => {
    const qc = new QualityController();
    const report = qc.validateBatch("test", [
      {
        source: "test",
        title: "Same Car",
        ask_price: 10000,
        vin: "1HGCM82633A123456",
      },
      {
        source: "test",
        title: "Same Car",
        ask_price: 10000,
        vin: "1HGCM82633A123456",
      },
    ]);
    expect(report.valid).toBe(1);
    expect(report.duplicates).toBe(1);
  });
});
