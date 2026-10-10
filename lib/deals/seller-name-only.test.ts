import { describe, expect, it } from "vitest";
import {
  redactDealForNonFlipDesk,
  redactListingForNonFlipDesk,
  sellerDisplayName,
  sellerNameOnly,
} from "./deal-desk-access";

describe("seller name only for signed-in non-flip desks (Ren #308 P3)", () => {
  it("reduces a seller object to its display name", () => {
    expect(
      sellerDisplayName({ name: "Jane's Autos", profileUrl: "https://fb.com/jane", phone: "555-201-3344" }),
    ).toBe("Jane's Autos");
  });

  it("drops a seller value that is really contact or a link", () => {
    for (const v of [
      "(555) 201-3344",
      "+1 555 201 3344",
      "jane@example.com",
      "https://www.facebook.com/marketplace/profile/123",
      "www.janesautos.com",
      "janesautos.com",
      { name: "555.201.3344" },
      { profileUrl: "https://x.example/u/1" },
      "",
      null,
      42,
    ])
      expect({ v, n: sellerDisplayName(v) }).toEqual({ v, n: null });
  });

  it("keeps a plain name (including digits that aren't a phone)", () => {
    expect(sellerDisplayName("  Route 66   Motors ")).toBe("Route 66 Motors");
    expect(sellerDisplayName("A1 Auto")).toBe("A1 Auto");
  });

  it("deal page: non-flip desk gets seller as a name string, no profile link, no contact, under options too", () => {
    const deal = {
      id: "d1",
      seller: { name: "Jane Q. Private", profileUrl: "https://fb.com/jane", email: "jane@example.com" },
      sellerUrl: "https://fb.com/jane",
      sellerProfileUrl: "https://fb.com/jane",
      options: {
        seller: { name: "Jane Q. Private", url: "https://fb.com/jane", phone: "555-201-3344" },
        sellerInfo: "jane@example.com",
        contact: { phone: "555-201-3344" },
        fuel: "gas",
      },
    };
    const out = redactDealForNonFlipDesk(deal);
    expect(out.seller).toBe("Jane Q. Private");
    expect(out.sellerUrl).toBeUndefined();
    expect(out.sellerProfileUrl).toBeUndefined();
    expect(out.options.seller).toBe("Jane Q. Private");
    expect(out.options.sellerInfo).toBeUndefined();
    expect(out.options.contact).toBeUndefined();
    expect(out.options.fuel).toBe("gas");
    const json = JSON.stringify(out);
    for (const leak of ["fb.com", "jane@example.com", "555-201-3344"]) expect(json).not.toContain(leak);
    expect(deal.seller).toEqual(expect.objectContaining({ profileUrl: "https://fb.com/jane" })); // input untouched
  });

  it("cards: same reduction, including alsoOn copies", () => {
    const out = redactListingForNonFlipDesk({
      id: "c1",
      seller: "jane@example.com",
      sellerName: "Jane",
      seller_url: "https://x.example/jane",
      alsoOn: [{ source: "x", seller: { name: "Jane", link: "https://x.example" }, sellerLink: "https://x.example" }],
    });
    expect(out.seller).toBeUndefined();
    expect(out.sellerName).toBe("Jane");
    expect(out.seller_url).toBeUndefined();
    expect(out.alsoOn[0].seller).toBe("Jane");
    expect(out.alsoOn[0].sellerLink).toBeUndefined();
  });

  it("sellerNameOnly leaves rows without seller fields alone", () => {
    expect(sellerNameOnly({ id: "x", options: { fuel: "gas" } })).toEqual({ id: "x", options: { fuel: "gas" } });
  });
});
