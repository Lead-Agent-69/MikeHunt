import { describe, it, expect } from "vitest";
import { looksLikePaymentPrice } from "./payment-price";

describe("looksLikePaymentPrice (financing-teaser detector)", () => {
  // The canonical case that motivated this: same seller, same truck, two "prices".
  it("flags the in-house down-payment teaser but NOT the real cash listing", () => {
    expect(
      looksLikePaymentPrice(
        "2025 CHEVROLET SILVERADO 2500 HD CUSTOM 4x4 IN-HOUSE AVAILABLE",
      ),
    ).toBe(true);
    expect(
      looksLikePaymentPrice(
        "2025 CHEVROLET SILVERADO 2500 HD CUSTOM STRD BED 4x4",
      ),
    ).toBe(false);
  });

  it("catches the common payment/BHPH markers", () => {
    for (const t of [
      "2019 F-150 XLT - $2,999 down",
      "Camry only $289/mo",
      "$199 a month, drive today",
      "Buy Here Pay Here — no credit needed",
      "BHPH bad credit OK",
      "As low as $500 down WAC",
      "Take over lease 2022 Model 3",
    ]) {
      expect(looksLikePaymentPrice(t)).toBe(true);
    }
  });

  it("is conservative — a plain cash listing (even one mentioning financing) is NOT a teaser", () => {
    for (const t of [
      "2021 Honda Accord EX-L, clean title",
      "2018 Silverado 1500 LTZ 4x4, financing available", // real price + offers financing
      "2020 Tacoma TRD Off Road, we can help finance", // still not a payment number
      "",
      null,
    ]) {
      expect(looksLikePaymentPrice(t as string)).toBe(false);
    }
  });
});
