import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  completenessScore,
  enrichmentNeed,
  isQualityFlagged,
  maxModelYear,
  missingFields,
  qualityFlags,
  vinFlags,
} from "./sanity";

const NOW = new Date("2026-10-10T12:00:00Z");
const GOOD_VIN = "1HGCM82633A004352"; // valid check digit

describe("qualityFlags", () => {
  it("passes a normal listing", () => {
    expect(
      qualityFlags(
        { ask_price: 12000, mileage: 80000, year: 2003, vin: GOOD_VIN },
        NOW,
      ),
    ).toEqual([]);
  });

  it("flags price, mileage and year bounds", () => {
    expect(qualityFlags({ ask_price: 1 }, NOW)).toEqual(["price_below_300"]);
    expect(qualityFlags({ ask_price: 299 }, NOW)).toEqual(["price_below_300"]);
    expect(qualityFlags({ ask_price: 300 }, NOW)).toEqual([]);
    expect(qualityFlags({ ask_price: 500_001 }, NOW)).toEqual([
      "price_above_500k",
    ]);
    expect(qualityFlags({ mileage: 999_999 }, NOW)).toEqual([
      "mileage_above_500k",
    ]);
    expect(qualityFlags({ mileage: -1 }, NOW)).toEqual(["mileage_negative"]);
    expect(qualityFlags({ year: 1949 }, NOW)).toEqual(["year_before_1950"]);
    expect(qualityFlags({ year: 2027 }, NOW)).toEqual([]);
    expect(qualityFlags({ year: 2050 }, NOW)).toEqual([
      "year_after_next_model_year",
    ]);
    expect(maxModelYear(NOW)).toBe(2027);
  });

  it("collects every reason, in a stable order", () => {
    expect(
      qualityFlags(
        { ask_price: 1, mileage: 999_999, year: 2050, vin: "ABC" },
        NOW,
      ),
    ).toEqual([
      "price_below_300",
      "mileage_above_500k",
      "year_after_next_model_year",
      "vin_bad_format",
    ]);
  });

  it("checks the VIN format and check digit, but not on pre-1981 cars", () => {
    expect(vinFlags(GOOD_VIN)).toEqual([]);
    expect(vinFlags("1HGCM82633A004353")).toEqual(["vin_check_digit"]);
    expect(vinFlags("1HGCM82633A00435")).toEqual(["vin_bad_format"]);
    expect(vinFlags("1HGCM82633AO04352")).toEqual(["vin_bad_format"]); // letter O
    expect(vinFlags("")).toEqual([]);
    expect(qualityFlags({ year: 1972, vin: "1F05H123456" }, NOW)).toEqual([]);
  });

  it("treats missing values as unknown, not invalid", () => {
    expect(qualityFlags({}, NOW)).toEqual([]);
    expect(isQualityFlagged(null)).toBe(false);
    expect(isQualityFlagged([])).toBe(false);
    expect(isQualityFlagged(["price_below_300"])).toBe(true);
  });
});

describe("completeness", () => {
  const full = {
    images: ["https://img/1.jpg"],
    vin: GOOD_VIN,
    mileage: 50000,
    ask_price: 9000,
    condition: "clean_title",
    location_zip: "33601",
  };

  it("scores a complete listing 100 and an empty one 0", () => {
    expect(completenessScore(full)).toBe(100);
    expect(completenessScore({})).toBe(0);
    expect(missingFields({})).toEqual([
      "photo",
      "vin",
      "mileage",
      "price",
      "titleStatus",
      "location",
    ]);
  });

  it("weights each missing field", () => {
    expect(completenessScore({ ...full, images: [] })).toBe(75);
    expect(completenessScore({ ...full, vin: "" })).toBe(80);
    expect(completenessScore({ ...full, mileage: null })).toBe(85);
    expect(completenessScore({ ...full, condition: null })).toBe(85);
    expect(
      completenessScore({ ...full, location_zip: null, location_state: "FL" }),
    ).toBe(95);
    expect(
      completenessScore({
        ...full,
        location_zip: null,
        location_city: "Tampa",
        location_state: "FL",
      }),
    ).toBe(100);
  });

  it("gives enrichment need to the rows missing what a detail page fills", () => {
    expect(enrichmentNeed(full)).toBe(0);
    expect(enrichmentNeed({ ...full, vin: "" })).toBeGreaterThan(
      enrichmentNeed({ ...full, condition: null }),
    );
  });
});

describe("migration mirrors the TS rules", () => {
  const sql = readFileSync(
    "supabase/migrations/20261010210000_deals_quality_flags_completeness.sql",
    "utf8",
  );
  it("uses the same flag names and bounds", () => {
    for (const f of [
      "price_below_300",
      "price_above_500k",
      "mileage_negative",
      "mileage_above_500k",
      "year_before_1950",
      "year_after_next_model_year",
      "vin_bad_format",
      "vin_check_digit",
      "mileage_implausible",
      "year_vin_mismatch",
    ])
      expect(sql).toContain(`'${f}'`);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.vin_check_digit_ok(p_vin text)",
    );
    // auction bids are exempt from the low-price flag, same as isAuctionBid()
    expect(sql).toContain(
      "'copart','iaa','adesa','manheim','acv','gov_auction','repo_network'",
    );
    expect(sql).toContain("d.ask_price < 300");
    expect(sql).toContain("d.ask_price > 500000");
    expect(sql).toContain("d.mileage > 500000");
    expect(sql).toContain("d.year < 1950");
  });
  it("keeps both columns server-only and makes no index", () => {
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).not.toMatch(/CREATE\s+INDEX/i);
    expect(sql).not.toMatch(/GRANT\s+SELECT/i);
  });
});

describe("pipeline wiring", () => {
  const src = readFileSync("lib/scrapers/pipeline.ts", "utf8");
  it("flags instead of dropping and keeps flagged rows out of scoring", () => {
    expect(src).toContain("quality_flags: flagged ? flags : null");
    expect(src).toContain("profit_score: flagged ? null : analysis.score");
    expect(src).toContain('deal_verdict: flagged ? "pass" : analysis.verdict');
    expect(src).toContain(
      'columnsExist(getSupabase() as any, "deals", QUALITY_COLUMNS)',
    );
  });
  it("valuation comps skip flagged rows", () => {
    const mv = readFileSync("lib/scoring/market-value.ts", "utf8");
    expect(mv.replace(/\s+/g, "")).toContain(
      "qualityFlags({ask_price:r.ask_price,mileage:r.mileage,year:r.year",
    );
  });
});
