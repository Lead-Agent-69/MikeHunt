import { describe, expect, it } from "vitest";
import { sellerContact, sellerContactFields } from "./deal-contact";

describe("sellerContact", () => {
  it("reads canonical phone, email, and contact URL from options.contact", () => {
    const row = {
      options: {
        contact: {
          phone: " 305-555-1212 ",
          email: "sales@example.com",
          url: "https://dealer.example.com/contact",
        },
      },
    };

    expect(sellerContact(row)).toEqual({
      phone: "305-555-1212",
      email: "sales@example.com",
      url: "https://dealer.example.com/contact",
    });
    expect(sellerContactFields(row)).toEqual({
      sellerPhone: "305-555-1212",
      sellerEmail: "sales@example.com",
      sellerContactUrl: "https://dealer.example.com/contact",
    });
  });

  it("falls back to projected contact URL fields", () => {
    expect(sellerContact({ contact_url: "https://shop.example.com" })).toEqual({
      phone: null,
      email: null,
      url: "https://shop.example.com",
    });
  });

  it("uses dealer listing URLs as seller contact links", () => {
    expect(
      sellerContact({
        source: "independent_dealer",
        source_url: "https://aeofmiami.com/product/1",
      }),
    ).toMatchObject({
      url: "https://aeofmiami.com/product/1",
    });
  });

  it("does not treat government auction source URLs as direct seller contact", () => {
    expect(
      sellerContact({
        source: "gov_auction",
        source_url: "https://govdeals.com/asset/1",
      }),
    ).toMatchObject({
      url: null,
    });
  });
});
