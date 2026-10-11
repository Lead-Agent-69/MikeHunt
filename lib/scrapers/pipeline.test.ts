import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ingestCondition,
  matchesBuyerScope,
  normalizeAuctionEndAt,
} from "./pipeline";

describe("buyer-scoped intake", () => {
  const explorer = {
    title: "2020 Ford Explorer XLT",
    make: "Ford",
    model: "Explorer",
    year: 2020,
    ask_price: 18000,
    mileage: 60000,
    location_state: "MO",
    condition: "clean_title",
  };

  it("accepts an SUV by model without requiring SUV in its title", () => {
    expect(
      matchesBuyerScope(explorer, {
        state: "MO",
        vehicleType: "SUVs",
        q: "SUVs Ford Explorer",
      }),
    ).toBe(true);
    expect(
      matchesBuyerScope(
        { ...explorer, model: "F-150", title: "2020 Ford F-150" },
        { vehicleType: "SUVs" },
      ),
    ).toBe(false);
  });

  it("requires every model-search term, not just a common year or make", () => {
    expect(matchesBuyerScope(explorer, { q: "Ford Expedition" })).toBe(false);
    expect(matchesBuyerScope(explorer, { q: "Ford Explorer" })).toBe(true);
  });

  it("honors all selected states and makes without accepting unrelated rows", () => {
    const scope = { states: ["MO", "IL"], makes: ["Toyota", "Ford"] };
    expect(matchesBuyerScope(explorer, scope)).toBe(true);
    expect(
      matchesBuyerScope({ ...explorer, location_state: "IL" }, scope),
    ).toBe(true);
    expect(
      matchesBuyerScope({ ...explorer, location_state: "TX" }, scope),
    ).toBe(false);
    expect(matchesBuyerScope({ ...explorer, make: "Honda" }, scope)).toBe(
      false,
    );
  });

  it("does not present unknown mileage as meeting a requested mileage ceiling", () => {
    expect(matchesBuyerScope(explorer, { maxMileage: 80000 })).toBe(true);
    expect(
      matchesBuyerScope(
        { ...explorer, mileage: undefined },
        { maxMileage: 80000 },
      ),
    ).toBe(false);
    expect(matchesBuyerScope(explorer, { maxPrice: 12000 })).toBe(false);
    expect(matchesBuyerScope(explorer, { minYear: 2021 })).toBe(false);
    expect(matchesBuyerScope(explorer, { vehicleType: "Any vehicle" })).toBe(
      true,
    );
  });

  it("keeps dealer searches from importing private sellers or unknown seller types", () => {
    expect(
      matchesBuyerScope(
        { ...explorer, seller_type: "dealer" },
        { sellerType: "dealer" },
      ),
    ).toBe(true);
    expect(
      matchesBuyerScope(
        { ...explorer, seller_type: "private" },
        { sellerType: "dealer" },
      ),
    ).toBe(false);
    expect(matchesBuyerScope(explorer, { sellerType: "dealer" })).toBe(false);
  });

  it("does not widen clean-retail collection to salvage or auction cars", () => {
    expect(matchesBuyerScope(explorer, { lane: "clean-retail" })).toBe(true);
    expect(
      matchesBuyerScope(
        { ...explorer, condition: "salvage_title" },
        { lane: "clean-retail" },
      ),
    ).toBe(false);
    expect(
      matchesBuyerScope(
        { ...explorer, source: "copart" },
        { lane: "clean-retail" },
      ),
    ).toBe(false);
  });
});

describe("normalizeAuctionEndAt", () => {
  it("normalizes valid auction dates to ISO strings", () => {
    expect(normalizeAuctionEndAt("2026-07-01T17:00:00Z")).toBe(
      "2026-07-01T17:00:00.000Z",
    );
  });

  it("accepts Date instances", () => {
    expect(normalizeAuctionEndAt(new Date("2026-07-01T17:00:00Z"))).toBe(
      "2026-07-01T17:00:00.000Z",
    );
  });

  it("returns null for empty or invalid auction dates", () => {
    expect(normalizeAuctionEndAt("")).toBeNull();
    expect(normalizeAuctionEndAt("not a date")).toBeNull();
  });
});

describe("scoped persistence receipts", () => {
  it("reports accepted rows rather than attempted rows", () => {
    const pipeline = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    const sources = readFileSync("lib/scrapers/sources/index.ts", "utf8");

    expect(pipeline).toContain("return returnedRows.length");
    expect(sources).toContain("const saved = allDeals.length");
    expect(sources).toContain("return saved");
  });
});

describe("ingestCondition", () => {
  it("stores unknown condition as null, never a run_drive default", () => {
    expect(ingestCondition({})).toEqual({
      condition: null,
      titleSource: undefined,
    });
    expect(ingestCondition({ condition: "mystery" }).condition).toBeNull();
    expect(ingestCondition({ condition: "certified" }).condition).toBeNull();
    const src = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    expect(src).not.toMatch(/\?\?\s*"run_drive"/);
  });

  it("keeps provenance only when there is a condition", () => {
    expect(
      ingestCondition({
        condition: "salvage_title",
        title_source: "source_default",
      }),
    ).toEqual({ condition: "salvage_title", titleSource: "source_default" });
    expect(
      ingestCondition({ condition: "Clean Title", title_source: "listing" }),
    ).toEqual({ condition: "clean_title", titleSource: "listing" });
    expect(
      ingestCondition({
        condition: "certified",
        title_source: "source_default",
      }),
    ).toEqual({ condition: null, titleSource: undefined });
    expect(
      ingestCondition({
        condition: "clean_title",
        title_source: "bogus" as any,
      }),
    ).toEqual({ condition: "clean_title", titleSource: undefined });
  });
});
