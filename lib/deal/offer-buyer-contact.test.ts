import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buyerContactFromProfile } from "./offer-buyer-contact";

describe("cash offer buyer contact", () => {
  it("prefills only what the profile has", () => {
    expect(
      buyerContactFromProfile({
        profile: { name: "Jo Doe", phone: " 312-555-0100 " },
      }),
    ).toEqual({ name: "Jo Doe", phone: "312-555-0100", email: "" });
    expect(buyerContactFromProfile({ profile: {} })).toEqual({
      name: "",
      phone: "",
      email: "",
    });
    expect(buyerContactFromProfile(null)).toEqual({
      name: "",
      phone: "",
      email: "",
    });
  });

  it("prefers a business name when the profile has one", () => {
    expect(
      buyerContactFromProfile({
        profile: { name: "Jo", company_name: "Jo's Autos" },
      }).name,
    ).toBe("Jo's Autos");
  });

  it("the modal no longer ships made-up buyer details", () => {
    const src = readFileSync(
      "components/deal/CashOfferLetterModal.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/Vanguard|\(555\)|purchasing@mikehuntcars\.com/);
    expect(src).toContain("buyerContactFromProfile");
    expect(src).toContain('fetch("/api/profile"');
  });
});
