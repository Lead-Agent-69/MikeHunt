// Value-sanity contract for the ingest quality gate (QualityController, run by upsertDeals before
// persistence). Rows are real MikeHunt prod rows (lib/deals/__fixtures__/prod-deal-samples.json).
//
// The "current" block pins today's behavior. The skipped block is the spec for the coming
// value-sanity PR: enable each test (it.skip -> it) when the rule lands. Rule ids in the TODOs are
// proposals; keep them in sync with whatever the PR names them.
import { describe, expect, it } from "vitest";
import samples from "@/lib/deals/__fixtures__/prod-deal-samples.json";
import { QualityController } from "./quality-control";
import { isValidVin } from "@/lib/vehicle/vin";
import { looksLikePlaceholderPrice } from "@/lib/scoring/placeholder-price";
import { isKnownMake } from "./deal-normalizer";
import { isRetailCompSource } from "@/lib/scoring/market-value";
import { isAuctionBid, vinModelYears } from "@/lib/data-quality/sanity";

const R = samples.rows;
const run = (...rows: Record<string, any>[]) =>
  new QualityController().validateBatch("test", rows as any);
const fields = (rows: Record<string, any>[]) =>
  run(...rows).issues.map((i) => i.field);

describe("value sanity: quality gate", () => {
  it("passes ordinary real rows, including a legit $330k rebuilt exotic", () => {
    const r = run(R.normal_f250, R.legit_330k_exotic);
    expect(r.issues).toEqual([]);
    expect(r.validDeals).toHaveLength(2);
  });

  // Only unusable rows are rejected; implausible-but-parseable values are FLAGGED and kept
  // (lib/data-quality/sanity.ts). The original pins expected these to be dropped.
  it.each([
    ["negative price", { ask_price: -1 }, "required_fields"],
    ["year before 1900", { year: 1899 }, "year_parse"],
  ])("rejects %s", (_label, patch, field) => {
    const r = run({ ...R.normal_f250, ...patch });
    expect(r.validDeals).toHaveLength(0);
    expect(r.issues.map((i) => i.field)).toContain(field);
  });

  it.each([
    ["price under $300", { ask_price: 99 }, "price_below_300"],
    ["price over $500k", { ask_price: 1_000_001 }, "price_above_500k"],
    [
      "year two past next model year",
      { year: new Date().getFullYear() + 2 },
      "year_after_next_model_year",
    ],
    ["year before 1950", { year: 1949, vin: null }, "year_before_1950"],
    ["negative mileage", { mileage: -1 }, "mileage_negative"],
    ["mileage over 500,000", { mileage: 500_001 }, "mileage_above_500k"],
    ["16-character VIN", { vin: "1FT7W2BT8GED1180" }, "vin_bad_format"],
  ])("flags (keeps) %s", (_label, patch, field) => {
    const r = run({ ...R.normal_f250, ...patch } as any);
    expect(r.validDeals).toHaveLength(1);
    expect(r.issues.map((i) => i.field)).toContain(field);
  });

  it("accepts next model year (a 2027 in Oct 2026 is a real new car)", () => {
    expect(
      run({ ...R.normal_f250, year: new Date().getFullYear() + 1 }).validDeals,
    ).toHaveLength(1);
  });

  it("drops an exact in-batch repeat (same VIN + price) but keeps the first", () => {
    const r = run(R.normal_f250, { ...R.normal_f250 });
    expect(r.validDeals).toHaveLength(1);
    expect(r.issues.map((i) => i.field)).toEqual(["duplicate"]);
  });

  it("a $100 live gov-auction bid is a bid: kept, no placeholder flag", () => {
    expect(R.gov_auction_100_dollar_bid.source).toBe("gov_auction");
    // The comp filter would call $100 a placeholder ask; the sanity gate knows it's a bid.
    expect(
      looksLikePlaceholderPrice(R.gov_auction_100_dollar_bid.ask_price),
    ).toBe(true);
    const r = run(R.gov_auction_100_dollar_bid);
    expect(r.validDeals).toHaveLength(1);
    expect(fields([R.gov_auction_100_dollar_bid])).toEqual([]);
  });
});

describe("value sanity: flag-do-not-drop rules", () => {
  // TODO(sanity-pr): reject or flag 17-char VINs whose check digit fails (isValidVin). Proposed
  // rule id "vin_check_digit". Flag, don't drop: the listing is real, only the VIN is suspect, so
  // store vin = null and keep the raw value in options.vinRaw.
  // Implemented as a flag: the row is kept (vin stays for display; dedup never keys on it).
  it("flags a VIN with a bad check digit instead of storing it as ground truth", () => {
    expect(isValidVin(R.bad_check_digit_vin.vin!)).toBe(false);
    const r = run(R.bad_check_digit_vin);
    expect(r.issues.map((i) => i.field)).toContain("vin_check_digit");
    expect(r.validDeals).toHaveLength(1);
  });

  // TODO(sanity-pr): mileage that is implausibly LOW for the vehicle's age (< 100 mi on a car 3+
  // model years old) is almost always a placeholder ("1", "0", "100"). Proposed rule id
  // "mileage_implausible", a warning: keep the row, null the mileage for valuation.
  it("flags 1 mile on a 36-year-old truck as implausible mileage", () => {
    const r = run(R.mileage_1_on_1990_truck);
    expect(r.issues.map((i) => i.field)).toContain("mileage_implausible");
    expect(r.validDeals).toHaveLength(1);
  });

  it("does not flag delivery miles on a new or nearly new car", () => {
    const y = new Date().getFullYear();
    expect(
      fields([{ ...R.normal_f250, vin: null, year: y, mileage: 12 }]),
    ).toEqual([]);
    expect(
      fields([{ ...R.normal_f250, vin: null, year: y - 2, mileage: 5 }]),
    ).toEqual([]);
  });

  // TODO(sanity-pr): needs a real prod example before enabling (none in the 1,000-row sample).
  it("flags mileage above ~150k/year of age (e.g. 2025 model with 400k miles) as implausible", () => {
    const y = new Date().getFullYear();
    // Built from the real F-250 row with an odometer typo; no prod row in the sample has one.
    expect(
      fields([{ ...R.normal_f250, vin: null, year: y - 1, mileage: 400_000 }]),
    ).toContain("mileage_implausible");
    expect(
      fields([{ ...R.normal_f250, vin: null, year: y - 1, mileage: 60_000 }]),
    ).toEqual([]);
    expect(fields([R.normal_f250])).toEqual([]); // 85k on a 2016
  });

  // TODO(sanity-pr): make must be a known make (isKnownMake) or be repaired from the VIN decode;
  // otherwise "make_unknown". The prod row has no VIN, so it must be flagged, not guessed.
  it("flags a row whose make is not a make (2027 'Odyssey' / 'EX-L')", () => {
    expect(isKnownMake(R.make_is_a_model.make)).toBe(false);
    const r = run(R.make_is_a_model);
    expect(r.issues.map((i) => i.field)).toContain("make_unknown");
    expect(r.validDeals).toHaveLength(1);
  });

  // TODO(sanity-pr): auction rows carry a CURRENT BID, not an ask. They must be exempt from the
  // placeholder-price rule and kept out of retail ask comps. Today ask_price holds the bid.
  it("treats a gov_auction current bid as a bid (no placeholder flag, no retail comp)", () => {
    const bid = R.gov_auction_100_dollar_bid;
    expect(isAuctionBid(bid)).toBe(true);
    expect(fields([bid])).not.toContain("price_below_300");
    expect(isRetailCompSource(bid as any)).toBe(false);
    // A $100 ASK from a dealer is still flagged.
    expect(fields([{ ...R.normal_f250, ask_price: 100 }])).toContain(
      "price_below_300",
    );
  });

  // TODO(sanity-pr): listed year disagreeing with the VIN-decoded model year (vin_decodes.year) by
  // more than 1 should be flagged "year_vin_mismatch" (VIN wins for make/model; year is flagged).
  it("flags a listed year that disagrees with the VIN-decoded model year by more than 1", () => {
    // Model-year code (VIN position 10) of the real rows: G = 2016, M = 2021, L = 1990.
    expect(vinModelYears(R.normal_f250.vin)).toContain(2016);
    expect(vinModelYears(R.legit_330k_exotic.vin)).toContain(2021);
    expect(vinModelYears(R.mileage_1_on_1990_truck.vin)).toContain(1990);
    expect(fields([{ ...R.normal_f250, year: 2017 }])).not.toContain(
      "year_vin_mismatch",
    );
    expect(fields([{ ...R.normal_f250, year: 2019 }])).toContain(
      "year_vin_mismatch",
    );
    // A bad check digit VIN is never trusted for the year.
    expect(vinModelYears(R.bad_check_digit_vin.vin)).toEqual([]);
  });
});
