import { describe, expect, it } from "vitest";
import {
  LISTING_CONDITIONS,
  TITLE_CATEGORIES,
  conditionsFor,
  matchesTitleCategories,
  parseTitleTypes,
  titleCategory,
  titleCategoryCounts,
  titleCategoryDetail,
  titleCategoryOrFilter,
  titleSourceOf,
} from "./title-category";

describe("titleCategory", () => {
  it.each([
    ["clean_title", "clean"],
    ["rebuilt_title", "rebuilt"],
    ["salvage_title", "salvage"],
    ["parts_only", "salvage"],
    ["repairable", "rebuildable"],
    ["run_drive", "unknown"],
    ["hail", "unknown"],
    ["flood", "unknown"],
    ["fire", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
    ["", "unknown"],
    ["CLEAN_TITLE", "clean"],
  ] as const)("%s → %s", (condition, expected) => {
    expect(titleCategory({ condition })).toBe(expected);
  });

  it("never reads listing-title text", () => {
    expect(
      titleCategory({
        condition: "run_drive",
        title: "2019 Civic Clean Carfax clean title",
      } as any),
    ).toBe("unknown");
    expect(titleCategory({ condition: "clean" })).toBe("unknown");
    expect(titleCategory(null)).toBe("unknown");
  });

  it("every enum value maps to exactly one category", () => {
    for (const c of LISTING_CONDITIONS) {
      const hits = TITLE_CATEGORIES.filter((cat) =>
        conditionsFor([cat]).conditions.includes(c),
      );
      expect(hits).toEqual([titleCategory({ condition: c })]);
    }
  });
});

describe("titleCategoryDetail", () => {
  it("adds the parts-only sub-chip and damage chips", () => {
    expect(titleCategoryDetail({ condition: "parts_only" })).toEqual({
      category: "salvage",
      condition: "parts_only",
      partsOnly: true,
      damage: null,
    });
    expect(titleCategoryDetail({ condition: "flood" })).toMatchObject({
      category: "unknown",
      damage: "flood",
      partsOnly: false,
    });
    expect(titleCategoryDetail({ condition: "bogus" })).toMatchObject({
      category: "unknown",
      condition: null,
    });
  });
});

describe("conditionsFor", () => {
  it("maps categories to enum values; only unknown includes NULL", () => {
    expect(conditionsFor(["salvage"])).toEqual({
      conditions: ["parts_only", "salvage_title"],
      includeNull: false,
    });
    expect(conditionsFor(["unknown"])).toEqual({
      conditions: ["run_drive", "flood", "fire", "hail"],
      includeNull: true,
    });
    expect(conditionsFor(["clean", "rebuildable"]).conditions).toEqual([
      "repairable",
      "clean_title",
    ]);
    expect(conditionsFor([])).toEqual({ conditions: [], includeNull: false });
  });
});

describe("parseTitleTypes", () => {
  it("parses comma-multi values, aliases and drops junk", () => {
    expect(parseTitleTypes("clean,salvage")).toEqual(["clean", "salvage"]);
    expect(parseTitleTypes(" Rebuildable , unknown,unknown ")).toEqual([
      "rebuildable",
      "unknown",
    ]);
    expect(parseTitleTypes("salvage_title,repairable,clean_title")).toEqual([
      "salvage",
      "rebuildable",
      "clean",
    ]);
    expect(parseTitleTypes("parts")).toEqual(["salvage"]);
    expect(parseTitleTypes("all")).toEqual([]);
    expect(parseTitleTypes("clean carfax")).toEqual([]);
    expect(parseTitleTypes(null)).toEqual([]);
    expect(parseTitleTypes("")).toEqual([]);
  });
});

describe("titleCategoryOrFilter", () => {
  it("builds a PostgREST or-expression on condition", () => {
    expect(titleCategoryOrFilter([])).toBeNull();
    expect(titleCategoryOrFilter(["clean"])).toBe("condition.in.(clean_title)");
    expect(titleCategoryOrFilter(["salvage", "rebuildable"])).toBe(
      "condition.in.(repairable,parts_only,salvage_title)",
    );
    expect(titleCategoryOrFilter(["unknown"])).toBe(
      "condition.in.(run_drive,flood,fire,hail),condition.is.null",
    );
  });
});

describe("matchesTitleCategories / titleCategoryCounts", () => {
  it("matches rows and counts all five buckets", () => {
    const rows = [
      { condition: "salvage_title" },
      { condition: "parts_only" },
      { condition: "repairable" },
      { condition: null },
      { condition: "clean_title" },
    ];
    expect(
      rows.filter((r) => matchesTitleCategories(r, ["salvage"])),
    ).toHaveLength(2);
    expect(rows.filter((r) => matchesTitleCategories(r, []))).toHaveLength(5);
    expect(titleCategoryCounts(rows)).toEqual([
      { value: "clean", count: 1, label: "Clean title" },
      { value: "rebuilt", count: 0, label: "Rebuilt title" },
      { value: "salvage", count: 2, label: "Salvage title", partsOnly: 1 },
      { value: "rebuildable", count: 1, label: "Rebuildable" },
      { value: "unknown", count: 1, label: "Title unknown" },
    ]);
  });
});

describe("titleSourceOf", () => {
  it("reads options.titleSource (object, JSON string or projected) and nothing else", () => {
    expect(
      titleSourceOf({
        options: { titleSource: "listing", contact: { phone: "1" } },
      }),
    ).toBe("listing");
    expect(
      titleSourceOf({
        options: JSON.stringify({ titleSource: "source_default" }),
      }),
    ).toBe("source_default");
    expect(titleSourceOf({ title_source: "listing" })).toBe("listing");
    expect(titleSourceOf({ options: { titleSource: "made-up" } })).toBeNull();
    expect(titleSourceOf({ options: "{bad json" })).toBeNull();
    expect(titleSourceOf({})).toBeNull();
    expect(titleSourceOf(null)).toBeNull();
  });
});
