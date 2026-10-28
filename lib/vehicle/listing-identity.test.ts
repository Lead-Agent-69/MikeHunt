import { describe, expect, it } from "vitest";
import {
  listingIdentityWarning,
  withholdConflictingEconomics,
} from "./listing-identity";

describe("listing identity disagreement", () => {
  it.each([" ", "unknown"])(
    "also withholds conclusions for an unresolved reported make: %j",
    (make) => {
      expect(
        withholdConflictingEconomics({
          year: 2020,
          make,
          model: "4Runner",
          sellEstimate: 15000,
        }).sellEstimate,
      ).toBeUndefined();
    },
  );
  it("withholds stale model economics without mutating the source facts or contact", () => {
    const row = {
      title: "2024 Buick Allure Sport Touring",
      year: 2024,
      make: "Buick",
      model: "Envista",
      askPrice: 21000,
      sellEstimate: 25000,
      dealAnalysis: { roi: 200 },
      dealVerdict: "go",
      contact: { url: "https://dealer.test" },
    };
    const safe = withholdConflictingEconomics(row);
    expect(safe.sellEstimate).toBeUndefined();
    expect(safe.dealAnalysis).toBeUndefined();
    expect(safe.dealVerdict).toBeUndefined();
    expect(safe.askPrice).toBe(21000);
    expect(safe.contact).toEqual(row.contact);
    expect(row.sellEstimate).toBe(25000);
    expect(
      withholdConflictingEconomics({ ...row, model: "Allure" }).sellEstimate,
    ).toBe(25000);
  });
  it("flags the observed source-title/model conflict without inventing a correction", () => {
    expect(
      listingIdentityWarning({
        title: "2024 Buick Allure Sport Touring",
        year: 2024,
        make: "Buick",
        model: "Envista",
      }),
    ).toContain("recorded model differ");
  });
  it.each([
    { title: "2020 Ford F150 XLT", year: 2020, make: "FORD", model: "F-150" },
    {
      title: "2025 Toyota RAV-4 XLE",
      year: 2025,
      make: "Toyota",
      model: "RAV4",
    },
    { title: "2020 BMW 330i Sedan", year: 2020, make: "BMW", model: "330i" },
    { title: "New arrival", year: 2024, make: "Buick", model: "Envista" },
    { title: "2024 Buick Allure", make: "Buick", model: "Envista" },
    { title: 123, year: 2024, make: "Buick", model: "Envista" },
  ])("does not flag formatting or missing identity evidence: %j", (row) => {
    expect(listingIdentityWarning(row as any)).toBeNull();
  });

  it.each([" ", "\t", "unknown", " OTHER ", "unspecified", "n/a"])(
    "withholds model-dependent conclusions for an unresolved reported model: %j",
    (model) => {
      const row = {
        title: "2009 Freightliner",
        year: 2009,
        make: "Freightliner",
        model,
        askPrice: 9000,
        sellEstimate: 18000,
        profitEstimate: 6000,
        dealVerdict: "go",
      };
      expect(listingIdentityWarning(row)).toContain("identity is incomplete");
      const safe = withholdConflictingEconomics(row);
      expect(safe.sellEstimate).toBeUndefined();
      expect(safe.profitEstimate).toBeUndefined();
      expect(safe.dealVerdict).toBeUndefined();
      expect(safe.askPrice).toBe(9000);
      expect(safe.model).toBe(model);
      expect(row.sellEstimate).toBe(18000);
    },
  );
});
