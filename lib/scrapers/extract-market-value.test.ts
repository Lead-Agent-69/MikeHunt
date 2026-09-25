import { describe, it, expect } from "vitest";
import { findMarketValue } from "./extract-market-value";

// Pins the verified retail value schemas (docs/findings/value-schemas.md) so a capture's worth isn't
// lost to a future refactor. The finder is schema-agnostic — these assert it lands on the real
// third-party comp and rejects MSRP/payment noise across the actual nesting each site uses.
describe("findMarketValue", () => {
  it("harvests AutoTrader KBB Fair Purchase Price from the pricingDetail shape", () => {
    // Real AutoTrader __NEXT_DATA__ shape (value-schemas.md). kbbFppAmount is the central FPP;
    // High/Low straddle it; salePrice is the ask; msrp/monthly are noise to reject.
    const listing = {
      pricingDetail: {
        dealIndicator: "Great",
        displayPrice: 9500,
        kbbFppAmount: 10685,
        kbbFppDelta: 1185,
        kbbFppHighAmount: 11485,
        kbbFppLowAmount: 9860,
        salePrice: 9500,
      },
      monthlyPayment: 199,
      msrp: 24990,
      kbbVehicleId: 382444,
    };
    // Median of {9860, 10685, 10685(named-weighted), 11485} → lands on the central FPP, not the band edges.
    expect(findMarketValue(listing, 9500)).toBe(10685);
  });

  it("reads TrueCar pricing.listPrice band without echoing payments", () => {
    const listing = {
      pricing: { listPrice: 32990, marketAverage: 33800 },
      monthly: 449,
      downPayment: 2000,
    };
    expect(findMarketValue(listing, 32990)).toBe(33800);
  });

  it("returns null when only the ask and MSRP are present (cars.com case)", () => {
    expect(findMarketValue({ price: 78433, msrp: 80308 }, 78433)).toBeNull();
  });

  it("rejects out-of-band values (payments below, MSRP far above)", () => {
    const listing = { marketValue: 250, otherMarketPrice: 999999 };
    expect(findMarketValue(listing, 20000)).toBeNull();
  });

  it("guards against junk input", () => {
    expect(findMarketValue(null, 10000)).toBeNull();
    expect(findMarketValue({ marketValue: 10000 }, 0)).toBeNull();
    expect(findMarketValue({ marketValue: 10000 }, 100)).toBeNull();
  });
});
