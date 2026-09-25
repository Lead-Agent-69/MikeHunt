import { describe, it, expect } from "vitest";
import { cleanCity } from "./clean-location";

describe("cleanCity", () => {
  it("keeps real cities (incl. multi-word and abbreviations)", () => {
    for (const c of [
      "Houston",
      "dallas",
      "Fort Worth",
      "San Antonio",
      "St. Louis",
      "Las Vegas",
      "Salt Lake City",
      "ALVIN",
      "Miami",
      "Los Angeles",
    ]) {
      expect(cleanCity(c)).toBeTruthy();
    }
  });

  it("strips decorative wrappers but keeps the city", () => {
    expect(cleanCity("** Houston **")).toBe("Houston");
    expect(cleanCity("+ Dallas")).toBe("Dallas");
  });

  it("rejects marketing / ad copy", () => {
    for (const j of [
      "** Fast Approvals! **",
      "** FAST APPROVALS! SE HABLA ESPANOL! **",
      "YEAR END BLOWOUT STARTS NOW!!!!",
      "We Finance Everyone",
    ]) {
      expect(cleanCity(j)).toBeNull();
    }
  });

  it("rejects dealer names", () => {
    for (const j of [
      "Auto Source Of Texas",
      "City Motor Miami LLC",
      "AML AUTO SALES",
      "Bob's Certified Dealership",
      "Autotrader Private Seller",
      "Private Seller",
    ]) {
      expect(cleanCity(j)).toBeNull();
    }
  });

  it("rejects street addresses (digits)", () => {
    expect(cleanCity("5104 East Olympic Blvd.")).toBeNull();
    expect(cleanCity("900 Tower Rd Mundelein, IL 60060")).toBeNull();
    expect(cleanCity("westside-southbay-310")).toBeNull();
  });

  it("rejects empty / nullish / too long", () => {
    expect(cleanCity(null)).toBeNull();
    expect(cleanCity("")).toBeNull();
    expect(cleanCity("   ")).toBeNull();
    expect(cleanCity("a".repeat(40))).toBeNull();
  });

  it("does not false-positive on cities containing junk substrings", () => {
    expect(cleanCity("Lincoln")).toBe("Lincoln"); // contains "inc"
    expect(cleanCity("Springfield")).toBe("Springfield");
  });
});
