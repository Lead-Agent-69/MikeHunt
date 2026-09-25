import { describe, it, expect } from "vitest";
import { checkPriceSanity } from "./price-sanity";

describe("checkPriceSanity — too-good-to-be-true detector", () => {
  it("catches the dropped-leading-digit typo (the $8,700 vs $48,700 Silverado)", () => {
    const s = checkPriceSanity(8700, 48000, "clean");
    expect(s.status).toBe("typo");
    expect(s.inferredPrice).toBe(48700); // prepended the dropped "4"
    expect(s.reason).toMatch(/typo/i);
  });

  it("catches an appended-zero style typo too", () => {
    // worth ~$28k, listed $2,850 -> likely $28,500
    const s = checkPriceSanity(2850, 28000, "clean");
    expect(s.status).toBe("typo");
    expect(s.inferredPrice).toBe(28500);
  });

  it("flags implausibly-low with no clean correction as bait/deposit", () => {
    // $500 on a $30k clean car — no single dropped digit lands near $30k → bait/deposit, not a typo
    const s = checkPriceSanity(500, 30000, "clean");
    expect(s.status).toBe("implausible");
  });

  it("does NOT false-flag legitimate deals or salvage", () => {
    expect(checkPriceSanity(22000, 30000, "clean").status).toBe("ok"); // 73% — a real deal
    expect(checkPriceSanity(15000, 30000, "clean").status).toBe("ok"); // 50% — steep but real
    expect(checkPriceSanity(6000, 30000, "salvage_title").status).toBe("ok"); // salvage is cheap
    expect(checkPriceSanity(2680, 12000, "repairable").status).toBe("ok"); // the real Copart Camry
  });
});
