import { afterEach, describe, expect, it } from "vitest";
import {
  __resetMarketIndexForTest,
  isFreshAskComp,
  isRetailCompSource,
  loadMarketIndex,
  lookupMarketValue,
} from "./market-value";

afterEach(() => __resetMarketIndexForTest());
const now = Date.parse("2026-10-09T18:00:00Z");

describe("asking-price comparison quality", () => {
  it("uses observed freshness and excludes known-ended lots", () => {
    expect(isFreshAskComp({ last_seen_at: "2026-10-09T17:00:00Z" }, now)).toBe(
      true,
    );
    expect(isFreshAskComp({ last_seen_at: "2026-10-02T18:00:00Z" }, now)).toBe(
      true,
    );
    for (const last_seen_at of [
      null,
      "unknown",
      "2026-10-02T17:59:59Z",
      "2026-10-10T18:00:00Z",
    ])
      expect(isFreshAskComp({ last_seen_at }, now)).toBe(false);
    expect(
      isFreshAskComp(
        {
          last_seen_at: "2026-10-09T17:00:00Z",
          auction_end_at: "2026-10-09T18:00:00Z",
        },
        now,
      ),
    ).toBe(false);
  });
  it("uses explicitly clean dealer cars as retail, not unspecified or rebuilt stock", () => {
    expect(
      isRetailCompSource({
        source: "independent_dealer",
        condition: "clean_title",
      }),
    ).toBe(true);
    expect(
      isRetailCompSource({ source: "independent_dealer", condition: "clean" }),
    ).toBe(true);
    for (const condition of [
      undefined,
      "run_drive",
      "rebuilt_title",
      "salvage_title",
    ])
      expect(
        isRetailCompSource({ source: "independent_dealer", condition }),
      ).toBe(false);
    expect(isRetailCompSource({ source: "copart", condition: "clean" })).toBe(
      false,
    );
    expect(isRetailCompSource({ source: "cars_com", condition: "clean" })).toBe(
      true,
    );
  });
  it("builds retail evidence from fresh clean dealers while excluding title contradictions and stale asks", async () => {
    const base = {
      make: "Toyota",
      model: "Corolla",
      year: 2022,
      mileage: 45000,
      source: "independent_dealer",
      condition: "clean_title",
      title: "2022 Toyota Corolla",
      last_seen_at: new Date().toISOString(),
      ask_price: 20000,
    };
    const rows = [
      ...Array.from({ length: 6 }, () => ({ ...base })),
      { ...base, title: "2022 Toyota Corolla Rebuilt Title", ask_price: 90000 },
      { ...base, ask_price: 90000, last_seen_at: "2020-01-01T00:00:00Z" },
      { ...base, ask_price: 90000, auction_end_at: "2020-01-01T00:00:00Z" },
      { ...base, condition: "rebuilt_title", ask_price: 12000 },
    ];
    const filters: unknown[][] = [];
    const fake = {
      from: (table: string) => {
        const query: any = {};
        for (const method of ["select", "eq", "gt", "lt", "gte"])
          query[method] = (...args: unknown[]) => {
            filters.push([method, ...args]);
            return query;
          };
        query.range = async () => ({
          data: table === "deals" ? rows : [],
          error: null,
        });
        return query;
      },
    };
    await loadMarketIndex(fake as any);
    const comps = lookupMarketValue("Toyota", "Corolla", 2022);
    expect(comps).toMatchObject({
      retail: 19000,
      nRetail: 6,
      nWholesale: 1,
      confidence: "medium",
      mileageMed: 45000,
    });
    expect(
      filters.some(
        (filter) => filter[0] === "gte" && filter[1] === "last_seen_at",
      ),
    ).toBe(true);
  });
});
