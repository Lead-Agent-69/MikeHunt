import { describe, expect, it } from "vitest";
import { gradeDataQuality } from "./data-quality";

describe("gradeDataQuality", () => {
  it("preserves zero-mile reports while leaving missing, negative and non-finite mileage unknown", () => {
    expect(gradeDataQuality({ mileage: 0 }).present).toContain("mileage");
    for (const mileage of [undefined, null, -1, NaN, Infinity]) {
      expect(gradeDataQuality({ mileage }).missing).toContain("mileage");
    }
  });
  it("does not count placeholders, partial VINs, invalid dates or non-web links as usable details", () => {
    const quality = gradeDataQuality({
      vin: "VIN pending",
      titleType: "unknown",
      condition: "unknown",
      mileage: Infinity,
      askPrice: Infinity,
      locationCity: "  ",
      locationState: "N/A",
      seller: "Not provided",
      sellerType: "unknown",
      sellerPhone: "unknown",
      sellerEmail: "none",
      sourceUrl: "javascript:alert(1)",
      sellerContactUrl: "not a URL",
      auctionEndAt: "not a date",
    });
    expect(quality.present).toEqual([]);
    expect(quality.score).toBe(0);
  });
  it.each(["run_drive", "repairable", "hail", "flood", "fire"])(
    "does not mistake %s for a reported title status",
    (condition) => {
      const quality = gradeDataQuality({ condition, titleType: "unknown" });
      expect(quality.missing).toContain("title");
      expect(quality.present).toContain("damage");
    },
  );
  it.each(["clean_title", "rebuilt_title", "salvage_title"])(
    "counts %s as a source-reported title without calling it verified",
    (condition) => {
      expect(gradeDataQuality({ condition }).present).toContain("title");
    },
  );
  it("accepts structurally complete VINs and dated auction reports without certifying authenticity", () => {
    expect(
      gradeDataQuality({
        vin: "1HGCM82633A004352",
        source: "copart",
        auctionEndAt: "2026-10-22T12:00:00Z",
      }).present,
    ).toEqual(expect.arrayContaining(["vin", "auction"]));
  });
  it("does not ask private retail buyers to confirm an auction deadline", () => {
    expect(
      gradeDataQuality({ source: "craigslist", sellerType: "private" }).missing,
    ).not.toContain("auction");
    expect(gradeDataQuality({ source: "copart" }).missing).toContain("auction");
  });

  it("requires a deadline for explicitly marked auctions on mixed marketplaces", () => {
    expect(
      gradeDataQuality({ source: "ebay_motors", sellerType: "auction" })
        .missing,
    ).toContain("auction");
    expect(
      gradeDataQuality({ source: "ebay_motors", sellerType: "private" })
        .missing,
    ).not.toContain("auction");
  });
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
