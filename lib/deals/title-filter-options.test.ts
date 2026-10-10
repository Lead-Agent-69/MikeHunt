import { describe, expect, it } from "vitest";
import { titleFilterOptions } from "@/lib/deals/title-filter-options";

describe("titleFilterOptions: five buckets for every browse surface", () => {
  it("always offers all five buckets including Unknown", () => {
    expect(titleFilterOptions(null).map((o) => o.value)).toEqual([
      "all",
      "clean",
      "rebuilt",
      "salvage",
      "rebuildable",
      "unknown",
    ]);
  });

  it("labels live facet counts, with the salvage parts-only count", () => {
    const opts = titleFilterOptions([
      { value: "clean", count: 12 },
      { value: "rebuilt", count: 0 },
      { value: "salvage", count: 7, partsOnly: 2 },
      { value: "rebuildable", count: 3 },
      { value: "unknown", count: 40 },
      { value: "parts", count: 99 },
    ]);
    expect(opts.find((o) => o.value === "salvage")?.label).toBe(
      "Salvage title (7, 2 parts only)",
    );
    expect(opts.find((o) => o.value === "unknown")?.label).toBe(
      "Title unknown (40)",
    );
    expect(opts.find((o) => o.value === "rebuilt")?.label).toBe(
      "Rebuilt title (0)",
    );
    expect(opts).toHaveLength(6);
  });
});
