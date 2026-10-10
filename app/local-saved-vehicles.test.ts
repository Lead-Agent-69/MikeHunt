import { describe, expect, it, vi } from "vitest";
import {
  toLocalSavedVehicle,
  saveLocalVehicle,
  removeLocalVehicle,
} from "@/hooks/useLocalSavedVehicles";
import type { DiscoveryDeal } from "@/components/discovery/types";

describe("local saved vehicle snapshots", () => {
  it("confirms device writes and reports blocked storage instead of success", () => {
    const vehicle = {
      id: "local-test",
      title: "Vehicle",
      askPrice: 0,
      source: "unknown",
      savedAt: "2026-10-09",
    };
    expect(saveLocalVehicle(vehicle)).toBe(true);
    expect(removeLocalVehicle(vehicle.id)).toBe(true);
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
    try {
      expect(saveLocalVehicle(vehicle)).toBe(false);
      expect(removeLocalVehicle(vehicle.id)).toBe(false);
    } finally {
      write.mockRestore();
    }
  });
  it("preserves buyer proof fields from discovery deals", () => {
    const saved = toLocalSavedVehicle({
      id: "deal-1",
      source: "independent_dealer",
      sourceUrl: "https://aeofmiami.com/product/1",
      seller: "AE of Miami",
      sellerType: "dealer",
      sellerPhone: "305-555-0100",
      sellerEmail: "sales@example.com",
      sellerContactUrl: "https://aeofmiami.com/product/1",
      title: "2019 BMW X3",
      year: 2019,
      make: "BMW",
      model: "X3",
      mileage: 82200,
      askPrice: 7900,
      sellEstimate: 13200,
      trueNetProfit: 2100,
      recommendedMaxBid: 6100,
      repairEstimate: 1500,
      transportEstimate: 1045,
      locationCity: "Miami",
      locationState: "FL",
      images: ["https://example.com/x3.jpg"],
      dataQuality: {
        score: 72,
        label: "Good",
        missing: ["vin"],
      },
      trustExplanation: {
        confidence: "medium",
        score: 58,
        reasons: ["Original source link is present", "3 photos"],
        nextChecks: ["verify VIN", "verify mileage"],
        summary: "Original source link is present · 3 photos",
      },
      firstSeenAt: "2026-10-02T03:05:05.823Z",
      lastSeenAt: "2026-10-02T07:54:25.770Z",
      grade: "good",
      discountPct: 14,
      gradeLabel: "Good deal",
      alsoOn: [],
      listingCount: 1,
    } satisfies DiscoveryDeal);

    expect(saved).toMatchObject({
      id: "deal-1",
      sellerType: "dealer",
      seller: "AE of Miami",
      sellerPhone: "305-555-0100",
      sellerEmail: "sales@example.com",
      sellerContactUrl: "https://aeofmiami.com/product/1",
      sellEstimate: 13200,
      estimatedProfit: 2100,
      recommendedMaxBid: 6100,
      repairEstimate: 1500,
      transportEstimate: 1045,
      sourceUrl: "https://aeofmiami.com/product/1",
      image: "https://example.com/x3.jpg",
      dataQuality: {
        score: 72,
        label: "Good",
        missing: ["vin"],
      },
      trustExplanation: {
        confidence: "medium",
        score: 58,
        reasons: ["Original source link is present", "3 photos"],
        nextChecks: ["verify VIN", "verify mileage"],
        summary: "Original source link is present · 3 photos",
      },
      firstSeenAt: "2026-10-02T03:05:05.823Z",
      lastSeenAt: "2026-10-02T07:54:25.770Z",
    });
    expect(saved.savedAt).toBeTruthy();
  });
});
