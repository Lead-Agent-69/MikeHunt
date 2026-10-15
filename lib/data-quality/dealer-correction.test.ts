import { describe, expect, it } from "vitest";
import {
  driveNationCorrection,
  type DealerCorrectionEvidence,
} from "./dealer-correction";

const sourceUrl = "https://www.drivenation.com/vehiclesDetail.php?1539";
const row = {
  source: "independent_dealer",
  source_url: sourceUrl,
  ask_price: 2180,
  mileage: 200,
  vin: "5XXG14J25PG166770",
  damage_type: "repairable",
  options: { sellerType: "dealer" },
};
const evidence: DealerCorrectionEvidence = {
  sourceUrl,
  askingPrice: 19520,
  mileage: 54124,
  vin: row.vin,
  condition: "clean_title",
  checkedAt: "2026-10-15T22:00:00Z",
};

describe("bounded DriveNation correction", () => {
  it("corrects source fields but invalidates old derived estimates and retains provenance", () => {
    const patch = driveNationCorrection(row, evidence);
    expect(patch).toMatchObject({
      ask_price: 19520,
      mileage: 54124,
      condition: "clean_title",
      damage_type: null,
      sell_estimate: null,
      true_net_profit: null,
      deal_verdict: "not_enough_data",
      is_arbitrage_opportunity: false,
    });
    expect(patch.options).toMatchObject({
      sellerType: "dealer",
      titleSource: "listing",
      sourceCorrection: {
        previousImportedAmount: 2180,
        previousImportedMileage: 200,
      },
    });
    expect(patch).not.toHaveProperty("id");
    expect(patch).not.toHaveProperty("active");
  });
  it("rejects a different vehicle or site", () => {
    expect(() =>
      driveNationCorrection(row, {
        ...evidence,
        sourceUrl: "https://other.example/vehiclesDetail.php?1539",
      }),
    ).toThrow();
    expect(() =>
      driveNationCorrection(row, { ...evidence, vin: "1HGCM82633A004352" }),
    ).toThrow();
  });
  it("rejects unverified mileage/price and preserves specific damage", () => {
    expect(() =>
      driveNationCorrection(row, { ...evidence, mileage: 6054772 }),
    ).toThrow();
    expect(() =>
      driveNationCorrection(row, { ...evidence, askingPrice: Number.NaN }),
    ).toThrow();
    expect(
      driveNationCorrection({ ...row, damage_type: "front end" }, evidence)
        .damage_type,
    ).toBe("front end");
  });
});
