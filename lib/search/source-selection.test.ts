import { describe, expect, it } from "vitest";
import { selectedSourceIds, validSourceSelection } from "./source-selection";
import { applySelectedSources } from "./inventory-filters";

describe("multiple selected sources", () => {
  it("keeps retailer and auction choices instead of treating the CSV as one platform", () => {
    expect(selectedSourceIds("cars_com,copart,cars_com")).toEqual([
      "cars_com",
      "copart",
    ]);
    let filter = "";
    applySelectedSources(
      {
        or: (value: string) => {
          filter = value;
        },
      },
      selectedSourceIds("cars_com,copart"),
    );
    expect(filter).toContain("source.eq.cars_com");
    expect(filter).toContain("source.eq.copart");
  });
  it("keeps per-dealer URL restrictions inside their OR branch", () => {
    let filter = "";
    applySelectedSources(
      {
        or: (value: string) => {
          filter = value;
        },
      },
      ["ae-of-miami", "copart"],
    );
    expect(filter).toContain(
      "and(source.eq.independent_dealer,or(source_url.ilike.%",
    );
    expect(filter).toContain("source.eq.copart");
  });
  it("rejects filter injection and overlong selections without silently broadening the search", () => {
    expect(validSourceSelection("copart,source.eq.private")).toBe(false);
    expect(validSourceSelection(Array(26).fill("copart").join(","))).toBe(
      false,
    );
    expect(validSourceSelection("cars_com,copart")).toBe(true);
    expect(selectedSourceIds("all")).toEqual([]);
  });
});
