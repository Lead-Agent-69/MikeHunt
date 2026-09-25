import { describe, it, expect } from "vitest";
import { isValidVin, extractVin, normalizeVin } from "./vin";

describe("isValidVin", () => {
  it("accepts known-valid VINs", () => {
    expect(isValidVin("1HGCM82633A004352")).toBe(true); // canonical Honda example
    expect(isValidVin("11111111111111111")).toBe(true); // all-ones is valid (check digit 1)
    expect(isValidVin("1M8GDM9AXKP042788")).toBe(true); // canonical example, check digit X
  });

  it("rejects wrong check digit", () => {
    expect(isValidVin("1HGCM82633A004353")).toBe(false); // last-of-check changed
    expect(isValidVin("1HGCM82613A004352")).toBe(false); // tampered body
  });

  it("rejects wrong length", () => {
    expect(isValidVin("1HGCM82633A00435")).toBe(false); // 16
    expect(isValidVin("1HGCM82633A0043521")).toBe(false); // 18
  });

  it("rejects illegal characters (I, O, Q)", () => {
    expect(isValidVin("1HGCM82633I004352")).toBe(false);
    expect(isValidVin("1HGCM8263OA004352")).toBe(false);
  });

  it("normalizes case, spaces, dashes", () => {
    expect(normalizeVin(" 1hgcm8-2633a004352 ")).toBe("1HGCM82633A004352");
    expect(isValidVin("1hgcm82633a004352")).toBe(true);
  });
});

describe("extractVin", () => {
  it("pulls a valid VIN out of free text", () => {
    expect(
      extractVin("Clean title, runs great. VIN: 1HGCM82633A004352 — call me"),
    ).toBe("1HGCM82633A004352");
  });

  it("ignores 17-char strings that fail the check digit", () => {
    expect(extractVin("order #ABCDEFGH123456789 shipped")).toBeNull();
  });

  it("returns null when there is no VIN", () => {
    expect(extractVin("2019 Ford F-150, 60k miles, $25,000")).toBeNull();
    expect(extractVin("")).toBeNull();
    expect(extractVin(null)).toBeNull();
  });

  it("finds the valid VIN among multiple 17-char tokens", () => {
    expect(
      extractVin("ref ABCDEFGH123456789 then real 1M8GDM9AXKP042788 here"),
    ).toBe("1M8GDM9AXKP042788");
  });
});
