import { describe, it, expect } from "vitest";
import { extractInterestProfile, scoreInterest } from "./interest-patterns";

describe("interest-patterns (implicit learning)", () => {
  const signals = [
    {
      make: "Toyota",
      model: "Tacoma",
      price: 22000,
      source: "copart",
      weight: 3,
    },
    { make: "Toyota", model: "Tacoma", price: 24000, source: "iaa", weight: 3 },
    {
      make: "Toyota",
      model: "4Runner",
      price: 26000,
      source: "copart",
      weight: 1,
    },
    {
      make: "Ford",
      model: "F-150",
      price: 30000,
      source: "autotrader",
      weight: 1,
    },
  ];

  it("ranks make/model by summed signal weight, strongest first", () => {
    const p = extractInterestProfile(signals);
    expect(p.patterns[0].make).toBe("Toyota");
    expect(p.patterns[0].model).toBe("Tacoma");
    expect(p.patterns[0].score).toBe(6); // two saves @3
    expect(p.patterns[0].avgPrice).toBe(23000);
  });

  it("derives a price band + favored sources", () => {
    const p = extractInterestProfile(signals);
    expect(p.priceLow).toBeGreaterThan(0);
    expect(p.priceHigh).toBeGreaterThanOrEqual(p.priceLow);
    expect(p.sources[0]).toBe("copart"); // highest summed weight (3+1)
  });

  it("scores an exact make+model match highest, with a reason", () => {
    const p = extractInterestProfile(signals);
    const hit = scoreInterest(
      { make: "Toyota", model: "Tacoma", price: 23000, source: "copart" },
      p,
    );
    expect(hit.affinity).toBeGreaterThan(0.9);
    expect(hit.reason).toMatch(/Tacoma/);
  });

  it("scores same-make lower than exact, unrelated near zero", () => {
    const p = extractInterestProfile(signals);
    const sameMake = scoreInterest({ make: "Toyota", model: "Camry" }, p);
    const exact = scoreInterest({ make: "Toyota", model: "Tacoma" }, p);
    const unrelated = scoreInterest({ make: "Honda", model: "Civic" }, p);
    expect(sameMake.affinity).toBeLessThan(exact.affinity);
    expect(sameMake.affinity).toBeGreaterThan(unrelated.affinity);
  });

  it("weights recent signals above stale ones (recency decay)", () => {
    const p = extractInterestProfile([
      { make: "Toyota", model: "Tacoma", weight: 3, ageDays: 0 }, // fresh
      { make: "Honda", model: "Civic", weight: 3, ageDays: 180 }, // ~4 half-lives old
    ]);
    // Same base weight, but the fresh signal wins.
    expect(p.patterns[0].make).toBe("Toyota");
    const tacoma = p.patterns.find((x) => x.make === "Toyota")!;
    const civic = p.patterns.find((x) => x.make === "Honda")!;
    expect(tacoma.score).toBeGreaterThan(civic.score);
  });

  it("floors very old signals instead of zeroing them (taste is sticky)", () => {
    const p = extractInterestProfile([
      { make: "Ford", model: "F-150", weight: 4, ageDays: 3650 },
    ]);
    expect(p.patterns[0].score).toBeGreaterThan(0);
  });

  it("is empty-safe (no signals → zero affinity)", () => {
    const p = extractInterestProfile([]);
    expect(p.patterns).toHaveLength(0);
    expect(scoreInterest({ make: "Toyota", model: "Tacoma" }, p).affinity).toBe(
      0,
    );
  });
});
