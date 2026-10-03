import { describe, expect, it } from "vitest";
import { gradeDataQuality } from "./data-quality";

describe("gradeDataQuality", () => {
  it("counts a seller contact URL as seller contact proof", () => {
    const quality = gradeDataQuality({
      seller: "AE of Miami",
      sellerContactUrl: "https://aeofmiami.com/contact",
    });

    expect(quality.present).toContain("sellerContact");
    expect(quality.missing).not.toContain("sellerContact");
  });

  it("counts a source listing URL as contact proof when saving a watched dealer car", () => {
    const quality = gradeDataQuality({
      images: ["https://example.com/photo.jpg"],
      titleType: "salvage",
      condition: "salvage_title",
      locationCity: "Miami",
      locationState: "FL",
      askPrice: 6980,
      seller: "AE of Miami",
      sellerType: "dealer",
      sellerContactUrl: "https://aeofmiami.com/product/2022-ford-explorer",
      sourceUrl: "https://aeofmiami.com/product/2022-ford-explorer",
    });

    expect(quality.present).toEqual(
      expect.arrayContaining(["seller", "sellerContact", "source"]),
    );
    expect(quality.missing).not.toContain("sellerContact");
    expect(quality.missing).not.toContain("auction");
  });

  it("does not require auction dates for fixed-price dealer inventory", () => {
    const quality = gradeDataQuality({
      images: ["https://example.com/photo.jpg"],
      titleType: "salvage",
      condition: "salvage_title",
      mileage: 61692,
      locationCity: "Miami",
      locationState: "FL",
      askPrice: 9980,
      seller: "AE of Miami",
      sellerType: "dealer",
      sellerContactUrl: "https://aeofmiami.com/product/2022-lincoln-corsair",
      sourceUrl: "https://aeofmiami.com/product/2022-lincoln-corsair",
    });

    expect(quality.missing).toEqual(["vin"]);
    expect(quality.label).toBe("Excellent");
  });

  it("still expects auction timing for auction inventory", () => {
    const quality = gradeDataQuality({
      images: ["https://example.com/photo.jpg"],
      titleType: "salvage",
      condition: "salvage_title",
      mileage: 61692,
      locationCity: "Miami",
      locationState: "FL",
      askPrice: 9980,
      seller: "Copart",
      sellerType: "auction",
      sourceUrl: "https://copart.com/lot/123",
    });

    expect(quality.missing).toContain("auction");
  });
});
