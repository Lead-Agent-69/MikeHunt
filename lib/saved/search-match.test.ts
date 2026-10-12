import { describe, expect, it } from "vitest";
import { matchesSavedSearch } from "./search-match";
import { readFileSync } from "node:fs";
import path from "node:path";

const car = {
  make: "Honda",
  model: "Civic",
  year: 2021,
  location_state: "MO",
  source: "independent_dealer",
  condition: "clean_title",
  ask_price: 14000,
  true_net_profit: 3500,
  deal_verdict: "go",
  lat: 38.6,
  lng: -90.3,
};
describe("saved search constraints", () => {
  it.each(["down_payment", "reference", "current_bid"])(
    "does not trust stale GO/profit flags for %s price evidence",
    (kind) => {
      const stale = {
        ...car,
        options: {
          priceEvidence: { kind, listedAmount: 500, currentBid: 500 },
        },
      };
      expect(matchesSavedSearch(stale, { require_go: true })).toBe(false);
      expect(matchesSavedSearch(stale, { target_profit: 1000 })).toBe(false);
    },
  );
  it("keeps the collector's returned projection wired to matching evidence", () => {
    const pipeline = readFileSync(
      path.resolve("lib/scrapers/pipeline.ts"),
      "utf8",
    );
    const projection = pipeline
      .match(/const SELECT_COLS\s*=\s*"([^"]+)"/)?.[1]
      .split(",")
      .map((column) => column.trim());
    for (const column of [
      "location_state",
      "condition",
      "damage_type",
      "options",
      "lat",
      "lng",
      "true_net_profit",
      "deal_verdict",
    ])
      expect(projection).toContain(column);
    expect(pipeline).toContain(
      "matchesSavedSearch(deal, search, homeByUser.get(search.user_id))",
    );
  });
  it.each([
    { max_price: NaN },
    { target_profit: Infinity },
    { max_distance_miles: -1 },
  ])("rejects invalid numeric criteria: %j", (criteria) => {
    expect(matchesSavedSearch(car, criteria)).toBe(false);
  });
  it("matches all the stored form criteria together", () => {
    expect(
      matchesSavedSearch(car, {
        make: " HONDA ",
        model: "civic",
        state: "mo",
        min_year: 2020,
        max_year: 2022,
        max_price: 15000,
        seller_type: "dealer",
        title_type: "clean",
        lane: "clean-retail",
        target_profit: 3000,
        require_go: true,
      }),
    ).toBe(true);
  });
  it.each([
    { make: "Toyota" },
    { model: "Accord" },
    { state: "FL" },
    { min_year: 2022 },
    { max_year: 2020 },
    { max_price: 13000 },
    { seller_type: "private" },
    { title_type: "salvage" },
    { lane: "auction" },
    { lane: "government" },
    { lane: "damaged" },
    { lane: "parts" },
    { target_profit: 4000 },
    { is_active: false },
    { lane: "unrecognized" },
  ])("rejects out-of-scope listings: %j", (criteria) => {
    expect(matchesSavedSearch(car, criteria)).toBe(false);
  });
  it.each([
    [{ year: undefined }, { min_year: 2020 }],
    [{ year: undefined }, { max_year: 2025 }],
    [{ location_state: undefined }, { state: "MO" }],
    [{ condition: "run_drive" }, { title_type: "clean" }],
    [{ ask_price: 0 }, { max_price: 20000 }],
    [{ ask_price: undefined }, { max_price: 20000 }],
    [{ true_net_profit: undefined }, { target_profit: 1000 }],
    [{ deal_verdict: undefined }, { require_go: true }],
  ])("requires evidence for the selected constraint", (missing, criteria) => {
    expect(matchesSavedSearch({ ...car, ...missing }, criteria)).toBe(false);
  });
  it("does not treat dealer deposits as acquisition prices", () => {
    expect(
      matchesSavedSearch(
        {
          ...car,
          options: {
            priceEvidence: { kind: "down_payment", listedAmount: 14000 },
          },
        },
        { max_price: 15000 },
      ),
    ).toBe(false);
  });
  it("requires coordinates on both sides of a radius filter", () => {
    const criteria = { max_distance_miles: 50 };
    expect(matchesSavedSearch(car, criteria)).toBe(false);
    expect(matchesSavedSearch(car, criteria, { lat: 38.6, lng: -90.3 })).toBe(
      true,
    );
    expect(matchesSavedSearch(car, criteria, { lat: 34, lng: -118 })).toBe(
      false,
    );
    expect(
      matchesSavedSearch({ ...car, lat: undefined }, criteria, {
        lat: 38.6,
        lng: -90.3,
      }),
    ).toBe(false);
  });
  it("uses seller evidence rather than assuming a mixed marketplace is a dealer", () => {
    const mixed = { ...car, source: "ebay_motors" };
    expect(matchesSavedSearch(mixed, { seller_type: "dealer" })).toBe(false);
    expect(
      matchesSavedSearch(
        { ...mixed, options: { sellerType: "dealer" } },
        { seller_type: "dealer" },
      ),
    ).toBe(true);
    expect(
      matchesSavedSearch(
        { ...mixed, options: { sellerType: "private" } },
        { lane: "private" },
      ),
    ).toBe(true);
  });
  it("keeps title and damage independent", () => {
    const damaged = { ...car, damage_type: "front collision" };
    expect(
      matchesSavedSearch(damaged, { lane: "damaged", title_type: "clean" }),
    ).toBe(true);
    expect(matchesSavedSearch(damaged, { lane: "clean-retail" })).toBe(false);
  });
  it("recognizes government auction channels", () => {
    expect(
      matchesSavedSearch(
        { ...car, source: "gov_auction" },
        { lane: "government", seller_type: "auction" },
      ),
    ).toBe(true);
  });
});
