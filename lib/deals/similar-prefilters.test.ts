import { describe, expect, it } from "vitest";
import {
  SIMILAR_WIDEN_TIERS,
  boundsFor,
  knownPrice,
  matchesSimilarFilters,
  selectWithWidening,
  type SimilarCandidate,
} from "./similar-prefilters";

const EXPLORER = { make: "Ford", model: "Explorer", year: 2018, ask_price: 18000 };
const c = (id: string, make: string, model: string, year: number | null, ask: number | null) => ({
  id,
  make,
  model,
  year,
  ask_price: ask,
});

describe("similar hard prefilters", () => {
  it("widening order is price first, then year; segment never relaxes", () => {
    expect(SIMILAR_WIDEN_TIERS.map((t) => [t.priceBand, t.yearWindow])).toEqual([
      [0.4, 3],
      [0.75, 3],
      [null, 3],
      [null, 6],
    ]);
  });

  it("an Explorer never matches a Tesla Model S or a Honda Civic, at any tier", () => {
    for (const tier of SIMILAR_WIDEN_TIERS) {
      const b = boundsFor(EXPLORER, tier);
      expect(matchesSimilarFilters(EXPLORER, c("s", "Tesla", "Model S", 2018, 19000), b)).toBe(false);
      expect(matchesSimilarFilters(EXPLORER, c("v", "Honda", "Civic", 2018, 17000), b)).toBe(false);
      expect(matchesSimilarFilters(EXPLORER, c("p", "Honda", "Pilot", 2018, 18500), b)).toBe(true);
    }
  });

  it("strict tier: ±40% ask and ±3 years", () => {
    const b = boundsFor(EXPLORER, SIMILAR_WIDEN_TIERS[0]);
    expect(b).toEqual({ minPrice: 10800, maxPrice: 25200, minYear: 2015, maxYear: 2021 });
    expect(matchesSimilarFilters(EXPLORER, c("a", "Toyota", "Highlander", 2021, 25200), b)).toBe(true);
    expect(matchesSimilarFilters(EXPLORER, c("b", "Toyota", "Highlander", 2022, 20000), b)).toBe(false);
    expect(matchesSimilarFilters(EXPLORER, c("d", "Toyota", "Highlander", 2018, 30000), b)).toBe(false);
    // Unpriced candidate can't prove it sits in the band.
    expect(matchesSimilarFilters(EXPLORER, c("e", "Toyota", "Highlander", 2018, null), b)).toBe(false);
  });

  it("unknown source price skips the band (0 is unknown, not a $0 car)", () => {
    expect(knownPrice(0)).toBeNull();
    const src = { ...EXPLORER, ask_price: 0 };
    const b = boundsFor(src, SIMILAR_WIDEN_TIERS[0]);
    expect(b.minPrice).toBeNull();
    expect(b.maxPrice).toBeNull();
    expect(matchesSimilarFilters(src, c("a", "Jeep", "Cherokee", 2018, 90000), b)).toBe(true);
    expect(matchesSimilarFilters(src, c("b", "Jeep", "Cherokee", 2018, null), b)).toBe(true);
    expect(matchesSimilarFilters(src, c("c", "Tesla", "Model X", 2018, 20000), b)).toBe(false);
  });

  it("unknown source year skips the window", () => {
    const b = boundsFor({ ...EXPLORER, year: null }, SIMILAR_WIDEN_TIERS[0]);
    expect(b.minYear).toBeNull();
    expect(b.maxYear).toBeNull();
  });
});

describe("selectWithWidening", () => {
  const pool: SimilarCandidate[] = [
    c("civic", "Honda", "Civic", 2018, 18000),
    c("models", "Tesla", "Model S", 2018, 18000),
    c("pilot", "Honda", "Pilot", 2018, 18000), // strict
    c("edge", "Ford", "Edge", 2019, 30000), // needs ±75%
    c("tahoe", "Chevrolet", "Tahoe", 2017, 60000), // needs price off
    c("cherokee", "Jeep", "Cherokee", 2013, 15000), // needs year ±6
    c("old", "Jeep", "Wrangler", 2005, 15000), // never
  ];
  const fetcher = async (b: any) => pool.filter((r) => matchesSimilarFilters(EXPLORER, r, b));

  it("stops at the first tier with enough survivors", async () => {
    const res = await selectWithWidening(EXPLORER, fetcher, { min: 1 });
    expect(res.step).toBe("strict");
    expect(res.rows.map((r) => r.id)).toEqual(["pilot"]);
  });

  it("widens price before year, keeps tighter matches first, never adds cross-segment", async () => {
    const seen: string[] = [];
    const res = await selectWithWidening(
      EXPLORER,
      async (b, t) => {
        seen.push(t.step);
        return pool; // unfiltered fetcher — gate must still hold
      },
      { min: 4 },
    );
    expect(seen).toEqual(["strict", "price-wide", "price-off", "year-wide"]);
    expect(res.step).toBe("year-wide");
    expect(res.rows.map((r) => r.id)).toEqual(["pilot", "edge", "tahoe", "cherokee"]);
  });

  it("returns fewer rows rather than cross-segment junk", async () => {
    const res = await selectWithWidening(EXPLORER, fetcher, { min: 10 });
    expect(res.rows).toHaveLength(4);
    expect(res.rows.map((r) => r.id)).not.toContain("civic");
    expect(res.rows.map((r) => r.id)).not.toContain("models");
  });

  it("skips tiers whose window is identical when price is unknown", async () => {
    const seen: string[] = [];
    await selectWithWidening(
      { ...EXPLORER, ask_price: null },
      async (_b, t) => {
        seen.push(t.step);
        return [];
      },
    );
    expect(seen).toEqual(["strict", "year-wide"]);
  });

  it("reports failure without inventing rows", async () => {
    const res = await selectWithWidening(EXPLORER, async () => null);
    expect(res).toEqual({ rows: [], step: null, failed: true });
  });
});
