import { describe, it, expect } from "vitest";
import { enrichPriority } from "./enrich-priority";

const now = new Date().getFullYear();

describe("enrichPriority", () => {
  it("ranks a newer, underpriced, popular car highest", () => {
    const hot = enrichPriority({
      year: now - 3,
      ask_price: 9000,
      make: "Ford",
    });
    const cold = enrichPriority({
      year: now - 20,
      ask_price: 14000,
      make: "Fiat",
    });
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeGreaterThan(80);
  });

  it("returns 0 when year or price is missing", () => {
    expect(enrichPriority({ ask_price: 9000, make: "Ford" })).toBe(0);
    expect(enrichPriority({ year: 2020, make: "Ford" })).toBe(0);
    expect(enrichPriority({})).toBe(0);
  });

  it("rewards the flip price sweet spot over junk/expensive", () => {
    const sweet = enrichPriority({ year: now - 5, ask_price: 12000 });
    const tooCheap = enrichPriority({ year: now - 5, ask_price: 800 });
    const tooDear = enrichPriority({ year: now - 5, ask_price: 60000 });
    expect(sweet).toBeGreaterThan(tooCheap);
    expect(sweet).toBeGreaterThan(tooDear);
  });

  it("rewards underpricing", () => {
    const cheapForYear = enrichPriority({ year: now - 2, ask_price: 9000 });
    const pricedForYear = enrichPriority({ year: now - 2, ask_price: 26000 });
    expect(cheapForYear).toBeGreaterThan(pricedForYear);
  });

  it("boosts makes the dealer has profited on (closed loop)", () => {
    const base = enrichPriority({
      year: now - 5,
      ask_price: 12000,
      make: "Subaru",
    });
    const learned = enrichPriority(
      { year: now - 5, ask_price: 12000, make: "Subaru" },
      new Set(["subaru"]),
    );
    expect(learned).toBeGreaterThan(base);
  });

  it("gives popular makes a nudge, all else equal", () => {
    const popular = enrichPriority({
      year: now - 5,
      ask_price: 12000,
      make: "Toyota",
    });
    const niche = enrichPriority({
      year: now - 5,
      ask_price: 12000,
      make: "Maserati",
    });
    expect(popular).toBeGreaterThan(niche);
  });
});
