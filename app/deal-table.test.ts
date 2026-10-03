import { describe, expect, it } from "vitest";
import {
  proofFieldCount,
  proofCount,
  TABLE_PROOF_FIELD_COUNT,
  type TableRow,
} from "@/components/scan/DealTable";

describe("DealTable proof count", () => {
  it("counts seller contact as buyer proof", () => {
    const row = {
      id: "deal-1",
      source: "independent_dealer",
      year: 2022,
      make: "Ford",
      model: "Explorer",
      askPrice: 6980,
      profitEstimate: -3473,
      profitScore: 46,
      imageUrl: "https://example.com/photo.jpg",
      vin: "1FM5K8AB1NG000001",
      titleType: "salvage",
      damageType: "Salvage",
      mileage: 82200,
      locationState: "FL",
      seller: "AE of Miami",
      sellerContactUrl: "https://aeofmiami.com/product/1",
      auctionEndAt: "2026-10-02T07:54:25.770Z",
      sourceUrl: "https://aeofmiami.com/product/1",
    } satisfies TableRow;

    expect(proofCount(row)).toBe(11);
    expect(proofFieldCount(row)).toBe(11);
    expect(TABLE_PROOF_FIELD_COUNT).toBe(11);
  });

  it("does not require auction timing for dealer rows", () => {
    const row = {
      id: "dealer-1",
      source: "independent_dealer",
      year: 2023,
      make: "GMC",
      model: "Terrain",
      askPrice: 8995,
      profitEstimate: 2200,
      profitScore: 76,
      imageUrl: "https://example.com/photo.jpg",
      vin: "3GKALMEG7PL239037",
      titleType: "salvage",
      damageType: "Front end",
      mileage: 33423,
      locationState: "FL",
      seller: "AE of Miami",
      sellerType: "dealer",
      sellerContactUrl: "https://aeofmiami.com/product/terrain",
      sourceUrl: "https://aeofmiami.com/product/terrain",
    } satisfies TableRow;

    expect(proofFieldCount(row)).toBe(10);
    expect(proofCount(row)).toBe(10);
  });
});
