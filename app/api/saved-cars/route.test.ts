import { describe, expect, it } from "vitest";
import { savedTrustExplanation, sanitizeClientProofSnapshot } from "./route";

describe("saved cars trust snapshot", () => {
  it("builds buyer-facing proof and verification checks", () => {
    const trust = savedTrustExplanation({
      sourceUrl: "https://aeofmiami.com/product/1",
      images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      seller: "AE of Miami",
      estimatedProfit: -2500,
      dataQuality: {
        score: 73,
        missing: ["VIN", "Mileage", "Auction date"],
      },
    });

    expect(trust).toMatchObject({
      confidence: "medium",
      summary:
        "Original source link is present · 2 photos · Seller/source is identified",
      reasons: [
        "Original source link is present",
        "2 photos",
        "Seller/source is identified",
      ],
      missing: ["VIN", "Mileage", "Auction date"],
    });
    expect(trust.nextChecks).toEqual(
      expect.arrayContaining(["verify VIN", "verify mileage"]),
    );
    expect(trust.score).toBeGreaterThan(50);
  });

  it("preserves structured scan proof when a watched car is saved", () => {
    const proof = sanitizeClientProofSnapshot({
      dataQuality: {
        score: 73,
        label: "Good",
        missing: ["vin", "mileage", "auction"],
      },
      trustExplanation: {
        confidence: "medium",
        score: 58.25,
        reasons: [
          "FL matches selected market",
          "damaged lane",
          "Ford matches make focus",
          "dealer seller scope",
          "ae-of-miami dealer target",
          "Original source link is present",
          "extra reason that should still fit",
        ],
        nextChecks: ["verify VIN", "verify mileage", "confirm auction timing"],
        summary:
          "FL matches selected market · damaged lane · Ford matches make focus",
      },
    });

    expect(proof.dataQuality).toMatchObject({
      score: 73,
      label: "Good",
      missing: ["vin", "mileage", "auction"],
    });
    expect(proof.trustExplanation?.reasons).toEqual(
      expect.arrayContaining([
        "FL matches selected market",
        "ae-of-miami dealer target",
      ]),
    );
    expect(proof.trustExplanation?.nextChecks).toEqual([
      "verify VIN",
      "verify mileage",
      "confirm auction timing",
    ]);
  });
});
