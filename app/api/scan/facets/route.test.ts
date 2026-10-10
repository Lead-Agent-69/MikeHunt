import { describe, expect, it } from "vitest";
import { buildScanFacetSummary } from "./route";

describe("buildScanFacetSummary", () => {
  it("returns all five title buckets; operability is not a clean title", () => {
    expect(
      buildScanFacetSummary([
        { condition: "repairable" },
        { condition: "run_drive" },
        { condition: "clean" },
        { condition: null },
        { condition: "parts_only" },
      ]).titleTypes,
    ).toEqual([
      { value: "clean", count: 0, label: "Clean title" },
      { value: "rebuilt", count: 0, label: "Rebuilt title" },
      { value: "salvage", count: 1, label: "Salvage title", partsOnly: 1 },
      { value: "rebuildable", count: 1, label: "Rebuildable" },
      { value: "unknown", count: 3, label: "Title unknown" },
    ]);
  });
  it("turns live inventory rows into buyer-facing filter categories", () => {
    const facets = buildScanFacetSummary([
      {
        make: "Ford",
        location_state: "FL",
        year: 2022,
        condition: "salvage_title",
        source: "independent_dealer",
        source_url: "https://aeofmiami.com/product/2022-ford-explorer",
      },
      {
        make: "Ford",
        location_state: "FL",
        year: 2021,
        condition: "salvage_title",
        source: "copart",
        source_url: "https://www.copart.com/lot/123",
      },
      {
        make: "Toyota",
        location_state: "TX",
        year: "2020",
        condition: "clean_title",
        source: "gov_auction",
        source_url: "https://www.govdeals.com/asset/42",
      },
    ]);

    expect(facets.makes).toEqual([
      { make: "Ford", count: 2 },
      { make: "Toyota", count: 1 },
    ]);
    expect(facets.states).toEqual(["FL", "TX"]);
    expect(facets.years).toEqual([2022, 2021, 2020]);
    expect(facets.titleTypes).toEqual([
      { value: "clean", count: 1, label: "Clean title" },
      { value: "rebuilt", count: 0, label: "Rebuilt title" },
      { value: "salvage", count: 2, label: "Salvage title", partsOnly: 0 },
      { value: "rebuildable", count: 0, label: "Rebuildable" },
      { value: "unknown", count: 0, label: "Title unknown" },
    ]);
    expect(facets.sellerTypes).toEqual([
      { value: "auction", count: 2, label: "Auctions" },
      { value: "dealer", count: 1, label: "Dealers" },
    ]);
    expect(facets.sources).toEqual(
      expect.arrayContaining([
        {
          value: "ae-of-miami",
          count: 1,
          label: "AE of Miami",
          channel: "dealer",
        },
        {
          value: "copart",
          count: 1,
          label: "Copart",
          channel: "salvage",
        },
        {
          value: "govdeals",
          count: 1,
          label: "GovDeals",
          channel: "gov",
        },
      ]),
    );
  });
});
