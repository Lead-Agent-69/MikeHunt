import { describe, expect, it } from "vitest";
import { rankAlternatives, type AlternativeRow } from "./rank-alternatives";

const now = Date.parse("2026-10-09T12:00:00Z");
const base: AlternativeRow = {
  id: "base",
  make: "Toyota",
  model: "Camry",
  year: 2020,
  ask_price: 15000,
  mileage: 50000,
  condition: "clean",
  source: "independent_dealer",
  location_state: "TX",
  vin: "BASEVIN",
};
const candidate = (
  overrides: Partial<AlternativeRow> = {},
): AlternativeRow => ({
  ...base,
  id: "match",
  vin: "MATCHVIN",
  active: true,
  last_seen_at: new Date(now).toISOString(),
  ...overrides,
});

describe("alternative relevance", () => {
  it("ranks fit ahead of a much cheaper price", () => {
    const ranked = rankAlternatives(
      base,
      [
        candidate({
          id: "cheap",
          vin: "CHEAPVIN",
          year: 2018,
          ask_price: 10000,
        }),
        candidate({ id: "close", ask_price: 14500 }),
      ],
      now,
    );
    expect(ranked.map(({ row }) => row.id)).toEqual(["close", "cheap"]);
    expect(ranked[0].matchReasons).toContain("$500 lower asking price");
  });
  it.each([
    { active: false },
    { id: "base" },
    { vin: "BASEVIN" },
    { last_seen_at: "2026-09-01" },
    { last_seen_at: null },
    { auction_end_at: "2026-10-08" },
    { model: "Corolla" },
    { source: "copart" },
    { condition: "salvage" },
    { condition: "clean", damage_type: "front_end" },
    { ask_price: 500 },
  ])("excludes an unsuitable or unproven candidate %j", (overrides) => {
    expect(rankAlternatives(base, [candidate(overrides)], now)).toEqual([]);
  });
  it("deduplicates identifiers and VINs", () => {
    expect(
      rankAlternatives(
        base,
        [candidate(), candidate(), candidate({ id: "duplicate" })],
        now,
      ),
    ).toHaveLength(1);
  });
  it("never claims lower acquisition cost from an auction bid", () => {
    const auction = { ...base, source: "copart", condition: "salvage" };
    const result = rankAlternatives(
      auction,
      [candidate({ source: "copart", condition: "salvage", ask_price: 500 })],
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0].priceDifference).toBeUndefined();
    expect(result[0].matchReasons.join(" ")).not.toContain(
      "lower asking price",
    );
  });
});
