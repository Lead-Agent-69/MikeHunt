import { describe, it, expect } from "vitest";
import { analyzeDeal } from "./deal-analyzer";

// No market index loaded in unit tests → lookupMarketValue returns null and the analyzer falls back
// to the offline baseline. These lock in the reality-gate behavior (bait + garbage-make) and that a
// normal deal scores sanely.

describe("analyzeDeal reality gate", () => {
  it("flags financing/lease bait (fake $999) as implausible → pass", () => {
    const a = analyzeDeal({
      year: 2024,
      make: "Ford",
      model: "F-150",
      ask_price: 999,
      condition: "run_drive",
      title: "2024 Ford F-150 WE FINANCE FINANCIAMOS",
      source: "craigslist",
    } as any);
    expect(a.priceImplausible).toBe(true);
    expect(a.verdict).toBe("pass");
    expect(a.score).toBeLessThanOrEqual(20);
  });

  it("flags an unrecognized make (junk listing) as implausible → pass", () => {
    const a = analyzeDeal({
      year: 2024,
      make: "Biz",
      model: "On Wheels",
      ask_price: 1234,
      condition: "run_drive",
      title: "2024 Biz On Wheels",
      source: "craigslist",
    } as any);
    expect(a.priceImplausible).toBe(true);
    expect(a.verdict).toBe("pass");
  });

  it("scores a normal used truck sanely (not implausible, real resale)", () => {
    const a = analyzeDeal({
      year: 2018,
      make: "Ford",
      model: "F-150",
      ask_price: 14000,
      mileage: 90000,
      condition: "run_drive",
      title: "2018 Ford F-150 XLT",
      source: "craigslist",
    } as any);
    expect(a.priceImplausible).toBe(false);
    expect(a.sellEstimate).toBeGreaterThan(0);
    expect(["go", "hold", "pass"]).toContain(a.verdict);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.recommendedMaxBid).toBeGreaterThanOrEqual(0);
  });

  it("does not flag a legit full-price listing that merely advertises financing", () => {
    const a = analyzeDeal({
      year: 2021,
      make: "Dodge",
      model: "Challenger",
      ask_price: 27990,
      mileage: 30000,
      condition: "clean",
      title: "2021 Dodge Challenger Scat Pack WE FINANCE",
      source: "craigslist",
    } as any);
    expect(a.priceImplausible).toBe(false);
  });

  it("anchors a RETAIL listing's value to its ask (no fabricated profit above the ask)", () => {
    // Same car, low retail ask: the sell estimate must stay anchored to the ask (≤ ask × 1.15), not jump
    // to the car's baseline/comp value — that's the fake-profit bug (a $76k retail Corvette read as $100k).
    const a = analyzeDeal({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      ask_price: 5000,
      mileage: 40000,
      condition: "clean",
      title: "2020 Toyota Camry LE",
      source: "carvana",
    } as any);
    expect(a.sellEstimate).toBeLessThanOrEqual(Math.round(5000 * 1.15));
  });

  it("does not UNDER-value a retail listing far below its ask on a crude baseline (symmetric anchor)", () => {
    // Old, cheap-baseline car with a moderate retail ask + no comps: the sell estimate must not collapse
    // to the crude baseline (a false "overpriced") — it's floored near the ask (the market signal).
    const a = analyzeDeal({
      year: 2005,
      make: "Honda",
      model: "Civic",
      ask_price: 8000,
      mileage: 120000,
      condition: "clean",
      title: "2005 Honda Civic EX",
      source: "cargurus",
    } as any);
    expect(a.sellEstimate).toBeGreaterThanOrEqual(Math.round(8000 * 0.9) - 1);
  });

  it("does NOT ask-anchor an AUCTION listing — retail sell above the bid is real arbitrage", () => {
    // Identical car from Copart: the bid IS below retail, so the sell estimate should rise to the car's
    // real value, NOT be clamped to the bid.
    const a = analyzeDeal({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      ask_price: 5000,
      mileage: 40000,
      condition: "clean",
      title: "2020 Toyota Camry LE",
      source: "copart",
    } as any);
    expect(a.sellEstimate).toBeGreaterThan(Math.round(5000 * 1.15));
  });
});
