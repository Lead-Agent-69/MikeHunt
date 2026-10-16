import { describe, expect, it } from "vitest";
import { filterDisplayValue } from "./filter-display";

describe("applied search filter labels", () => {
  it("names each selected platform separately", () => {
    const label = filterDisplayValue("Source", "cars_com,copart");
    expect(label).toContain("Cars.com");
    expect(label).toContain("Copart");
  });
  it("keeps storage slugs out of source/title labels", () => {
    expect(filterDisplayValue("Source", "independent_dealer")).not.toContain(
      "_",
    );
    expect(filterDisplayValue("Title", "salvage_title")).toBe("Salvage title");
  });
  it("preserves model punctuation, ZIPs and literal searches", () => {
    expect(filterDisplayValue("Model", "F-150")).toBe("F-150");
    expect(filterDisplayValue("Search", "F-150_with_trailer")).toBe(
      "F-150_with_trailer",
    );
    expect(filterDisplayValue("Near", "02108 · 100 mi")).toBe("02108 · 100 mi");
  });
});
