import { describe, it, expect } from "vitest";
import {
  estimateBaselineValue,
  classifySegment,
  trimTierMultiplier,
} from "./baseline-value";

describe("trimTierMultiplier", () => {
  it("bumps performance/premium trims, docks base trims", () => {
    expect(trimTierMultiplier("Shelby GT500")).toBeGreaterThan(1);
    expect(trimTierMultiplier("Raptor")).toBeGreaterThan(1);
    expect(trimTierMultiplier("Denali")).toBeGreaterThan(1);
    expect(trimTierMultiplier("Work Truck")).toBeLessThan(1);
    expect(trimTierMultiplier("LS")).toBeLessThan(1);
    expect(trimTierMultiplier("GT")).toBe(1);
    expect(trimTierMultiplier(null)).toBe(1);
  });
  it("makes a Shelby worth more than a base Mustang", () => {
    const shelby = estimateBaselineValue(
      2018,
      "Ford",
      "Mustang",
      40000,
      "Shelby GT500",
    );
    const base = estimateBaselineValue(2018, "Ford", "Mustang", 40000, "Base");
    expect(shelby).toBeGreaterThan(base);
  });
});

describe("classifySegment", () => {
  it("classifies common models", () => {
    expect(classifySegment("Ford", "Mustang")).toBe("sports");
    expect(classifySegment("Toyota", "Sequoia")).toBe("fullsize_suv");
    expect(classifySegment("Ford", "F-150")).toBe("fullsize_truck");
    expect(classifySegment("Toyota", "Tacoma")).toBe("midsize_truck");
    expect(classifySegment("Honda", "Civic")).toBe("sedan");
    expect(classifySegment("BMW", "M5")).toBe("luxury");
  });
});

describe("estimateBaselineValue", () => {
  it("gives realistic resale, not inflated", () => {
    // A 2010 base Mustang should be a few thousand, NOT $42k.
    const mustang = estimateBaselineValue(2010, "Ford", "Mustang", 89000);
    expect(mustang).toBeGreaterThan(3000);
    expect(mustang).toBeLessThan(15000);

    // A high-mileage 2008 Sequoia should be modest.
    const sequoia = estimateBaselineValue(2008, "Toyota", "Sequoia", 313000);
    expect(sequoia).toBeGreaterThan(1200);
    expect(sequoia).toBeLessThan(12000);
  });

  it("newer holds more value than older", () => {
    const newer = estimateBaselineValue(2022, "Ford", "F-150", 30000);
    const older = estimateBaselineValue(2008, "Ford", "F-150", 180000);
    expect(newer).toBeGreaterThan(older);
  });

  it("high mileage reduces value", () => {
    const low = estimateBaselineValue(2018, "Toyota", "Camry", 40000);
    const high = estimateBaselineValue(2018, "Toyota", "Camry", 180000);
    expect(low).toBeGreaterThan(high);
  });

  it("returns 0 for missing/invalid year", () => {
    expect(estimateBaselineValue(null, "Ford", "F-150")).toBe(0);
  });
});
