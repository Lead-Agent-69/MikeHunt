import { describe, expect, it } from "vitest";
import { broncoSportIdentity } from "./bronco-sport-identity";
import { classifySegment } from "@/lib/scoring/baseline-value";
import {
  extractModel,
  normalizeDeal,
} from "@/lib/scrapers/tools/deal-normalizer";

describe("Bronco Sport identity", () => {
  it("repairs the confirmed modern model/trim split", () => {
    expect(
      broncoSportIdentity({
        make: "Ford",
        model: "Bronco",
        trim: "Sport",
        title: "2024 Ford Bronco Sport",
        year: 2024,
      }),
    ).toEqual({ model: "Bronco Sport", trim: null });
    expect(extractModel("2024 Ford Bronco Sport Big Bend", "Ford")).toBe(
      "Bronco Sport",
    );
    expect(classifySegment("Ford", "Bronco Sport")).toBe("compact_suv");
    expect(
      normalizeDeal({
        make: "Ford",
        model: "Bronco",
        trim: "Sport Big Bend",
        title: "2024 Ford Bronco Sport Big Bend",
        year: 2024,
      }),
    ).toMatchObject({ model: "Bronco Sport", trim: "Big Bend" });
  });
  it("preserves real trims and does not turn sport package wording into a model", () => {
    expect(
      normalizeDeal({
        make: "Ford",
        model: "Bronco",
        trim: "Badlands",
        title: "2024 Ford Bronco Sport Badlands",
      }),
    ).toMatchObject({ model: "Bronco Sport", trim: "Badlands" });
    expect(
      extractModel("2024 Ford Bronco Outer Banks Sport Package", "Ford"),
    ).toBe("Bronco");
    expect(extractModel("2024 Honda Accord Sport", "Honda")).toBe("Accord");
  });
  it("leaves classic Sport trims, conflicting years and ambiguous titles alone", () => {
    for (const row of [
      { year: 1972, title: "1972 Ford Bronco Sport" },
      { year: 2024, title: "1972 Ford Bronco Sport" },
      { title: "Ford Bronco Sport" },
      { year: 2024, title: "Bronco Sport package" },
    ])
      expect(
        broncoSportIdentity({
          make: "Ford",
          model: "Bronco",
          trim: "Sport",
          ...row,
        }),
      ).toBeNull();
    expect(extractModel("1972 Ford Bronco Sport", "Ford")).toBe("Bronco");
  });
  it("is idempotent and handles titleless-year metadata without inventing a year", () => {
    expect(
      normalizeDeal({
        year: 2024,
        title: "Ford Bronco Sport Big Bend",
        make: "Ford",
        model: "Bronco Sport",
        trim: "Big Bend",
      }),
    ).toMatchObject({ model: "Bronco Sport", trim: "Big Bend" });
    expect(
      broncoSportIdentity({
        year: 2024,
        title: "Ford Bronco Sport",
        make: "Ford",
        model: "Bronco",
      })?.model,
    ).toBe("Bronco Sport");
    const once = normalizeDeal({
      title: "2024 Ford Bronco Sport Big Bend",
      model: "Bronco",
      trim: "Sport",
    });
    expect(normalizeDeal(once)).toEqual(once);
  });
});
