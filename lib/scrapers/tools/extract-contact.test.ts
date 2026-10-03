import { describe, expect, it } from "vitest";
import { extractContactInfo } from "./extract-contact";

describe("extractContactInfo", () => {
  it("extracts phone, email, and a validated VIN from free text", () => {
    const info = extractContactInfo(
      "Call (305) 555-1234 or cars@example.com. VIN: 2HGFG12608H540812",
    );

    expect(info.phone).toBe("3055551234");
    expect(info.email).toBe("cars@example.com");
    expect(info.vin).toBe("2HGFG12608H540812");
  });

  it("rejects 17-character vehicle-like tokens that fail the VIN check digit", () => {
    const info = extractContactInfo("Stock token: 1HGCM82633A004353");

    expect(info.vin).toBeUndefined();
  });
});
