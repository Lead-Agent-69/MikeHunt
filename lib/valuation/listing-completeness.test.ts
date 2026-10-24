import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_WEIGHTS,
  completenessConfidencePenalty,
  completenessFor,
} from "./listing-completeness";

const full = {
  images: ["a", "b", "c", "d", "e"],
  vin: "1FTFW1E50NFA00001",
  mileage: 42000,
  year: 2022,
  make: "Ford",
  model: "F-150",
  condition: "clean_title",
  damage_type: "none",
  location_state: "MO",
};

describe("completenessFor", () => {
  it("weights sum to 1", () => {
    const s = Object.values(COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(s).toBeCloseTo(1);
  });

  it("a complete listing scores 1 with no penalty", () => {
    const c = completenessFor(full);
    expect(c).toMatchObject({
      score: 1,
      photoCount: 5,
      missing: [],
      source: "local",
    });
    expect(completenessConfidencePenalty(c)).toEqual({
      points: 0,
      reasons: [],
    });
  });

  it("an empty row scores 0 and the penalty is capped", () => {
    const c = completenessFor({});
    expect(c.score).toBe(0);
    expect(c.missing).toHaveLength(7);
    const p = completenessConfidencePenalty(c);
    expect(p.points).toBe(25);
    expect(p.reasons.join(" ")).toMatch(/capped/);
  });

  it("no photos is the biggest single hit", () => {
    const p = completenessConfidencePenalty(
      completenessFor({ ...full, images: [] }),
    );
    expect(p.points).toBe(15);
    expect(p.reasons[0]).toMatch(/no photos/);
  });

  it("few photos: smaller penalty; explicit photoCount wins over images", () => {
    expect(
      completenessConfidencePenalty(completenessFor({ ...full, images: ["a"] }))
        .points,
    ).toBe(5);
    expect(
      completenessFor({ ...full, images: [], photoCount: 12 }).photoCount,
    ).toBe(12);
  });

  it("each missing key field costs 4 points", () => {
    const c = completenessFor({ ...full, vin: "", mileage: null });
    expect(c.missing).toEqual(["vin", "mileage"]);
    expect(completenessConfidencePenalty(c).points).toBe(8);
  });

  it("a partial VIN does not count; a source-default title is not a stated title", () => {
    const c = completenessFor({
      ...full,
      vin: "1FTFW",
      title_source: "source_default",
    });
    expect(c.missing).toContain("vin");
    expect(c.missing).toContain("title");
  });

  it("ignores blank image URLs", () => {
    expect(
      completenessFor({ ...full, images: ["", "  ", null] as any }).photoCount,
    ).toBe(0);
  });
});
