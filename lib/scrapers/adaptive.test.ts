import { describe, it, expect } from "vitest";
import { recommendBatchSize, type CityStaleness } from "./adaptive";

const mk = (ageHours: (number | null)[]): CityStaleness[] =>
  ageHours.map((a, i) => ({ site: `c${i}`, ageHours: a }));

describe("recommendBatchSize", () => {
  it("returns the floor when everything is fresh", () => {
    expect(recommendBatchSize(mk([1, 2, 0, 3]), { min: 6, max: 24 })).toBe(6);
  });

  it("scales up with the number of stale/never-scraped cities", () => {
    const ranked = mk([null, null, null, null, null, null, null, null, 1, 2]);
    expect(recommendBatchSize(ranked, { min: 6, max: 24 })).toBe(8);
  });

  it("caps at max when far behind", () => {
    const ranked = mk(Array(40).fill(null));
    expect(recommendBatchSize(ranked, { min: 6, max: 24 })).toBe(24);
  });

  it("counts cities past the stale threshold", () => {
    const ranked = mk([10, 10, 10, 10, 10, 10, 10, 1, 1, 1]); // 7 stale (>4h)
    expect(recommendBatchSize(ranked, { staleHours: 4, min: 2, max: 24 })).toBe(
      7,
    );
  });
});
