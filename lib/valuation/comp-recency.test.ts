import { describe, expect, it } from "vitest";
import {
  effectiveSampleSize,
  estimateMonthlyDepreciation,
  recencyAdjust,
  weightedMedian,
} from "./comp-recency";

const NOW = Date.parse("2026-10-10T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("weightedMedian", () => {
  const plain = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  it("equal weights reproduce the ordinary median (odd and even)", () => {
    for (const xs of [
      [5],
      [1, 9],
      [3, 1, 2],
      [4, 1, 3, 2],
      [10, 20, 30, 40, 50, 60],
    ]) {
      expect(weightedMedian(xs.map((value) => ({ value, weight: 1 })))).toBe(
        plain(xs),
      );
    }
  });
  it("heavier recent points pull the median", () => {
    expect(
      weightedMedian([
        { value: 10, weight: 0.1 },
        { value: 20, weight: 0.1 },
        { value: 30, weight: 1 },
      ]),
    ).toBe(30);
  });
  it("empty → null", () => expect(weightedMedian([])).toBeNull());
});

describe("recencyAdjust", () => {
  it("weight halves every half-life", () => {
    expect(
      recencyAdjust(100, daysAgo(0), NOW, { halfLifeDays: 60 }).weight,
    ).toBe(1);
    expect(
      recencyAdjust(100, daysAgo(60), NOW, { halfLifeDays: 60 }).weight,
    ).toBeCloseTo(0.5);
    expect(
      recencyAdjust(100, daysAgo(120), NOW, { halfLifeDays: 60 }).weight,
    ).toBeCloseTo(0.25);
  });
  it("brings old prices to today with depreciation and index", () => {
    const r = recencyAdjust(10000, daysAgo(30.4375 * 6), NOW, {
      halfLifeDays: 90,
      depreciationPerMonth: 0.01,
      inflationPerMonth: 0.005,
    });
    expect(r.value).toBeCloseTo(10000 * 0.99 ** 6 * 1.005 ** 6, 6);
  });
  it("no adjustment by default; undated comps keep their price at half weight", () => {
    expect(
      recencyAdjust(10000, daysAgo(200), NOW, { halfLifeDays: 90 }).value,
    ).toBe(10000);
    const u = recencyAdjust(10000, null, NOW, {
      halfLifeDays: 90,
      depreciationPerMonth: 0.02,
    });
    expect(u).toMatchObject({ value: 10000, ageDays: null });
    expect(u.weight).toBeCloseTo(0.5);
  });
});

describe("effectiveSampleSize", () => {
  it("n for equal weights, less for skewed", () => {
    expect(effectiveSampleSize([1, 1, 1, 1])).toBe(4);
    expect(effectiveSampleSize([1, 0.1, 0.1, 0.1])).toBeLessThan(2);
  });
});

describe("estimateMonthlyDepreciation (from our own comps)", () => {
  it("recovers a known 15%/year curve", () => {
    const comps = [];
    for (const year of [2018, 2019, 2020, 2021, 2022]) {
      const p = 30000 * 0.85 ** (2022 - year);
      comps.push({ year, price: p }, { year, price: p });
    }
    const r = estimateMonthlyDepreciation(comps)!;
    expect(r.perYear).toBeCloseTo(0.15, 3);
    expect(r.perMonth).toBeCloseTo(1 - 0.85 ** (1 / 12), 4);
    expect(r).toMatchObject({ n: 10, years: 5 });
  });
  it("null when thin, too few years, or prices don't fall with age", () => {
    expect(estimateMonthlyDepreciation([{ year: 2020, price: 1 }])).toBeNull();
    const twoYears = Array.from({ length: 10 }, (_, i) => ({
      year: 2020 + (i % 2),
      price: 10000 + i,
    }));
    expect(estimateMonthlyDepreciation(twoYears)).toBeNull();
    const flat = Array.from({ length: 9 }, (_, i) => ({
      year: 2018 + (i % 3),
      price: 10000,
    }));
    expect(estimateMonthlyDepreciation(flat)).toBeNull();
  });
});
