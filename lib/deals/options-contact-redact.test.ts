import { describe, expect, it } from "vitest";
import {
  listingsForDesk,
  redactDealForNonFlipDesk,
  redactListingForNonFlipDesk,
} from "./deal-desk-access";

const options = {
  auction: { bidCount: 3 },
  sellerType: "dealer",
  contact: { phone: "5550100", email: "s@example.com", url: "https://x" },
  seller: { name: "Lot 9", phone: "5550101", email: "lot@example.com" },
  sellerPhone: "5550102",
};

describe("non-flip desks never get seller contact out of options", () => {
  it.each([
    ["listing card", redactListingForNonFlipDesk],
    ["deal page", redactDealForNonFlipDesk],
  ])("%s redaction strips options.contact / phone / email", (_n, fn) => {
    const out = fn({ id: "d", options } as any) as any;
    const raw = JSON.stringify(out);
    for (const v of [
      "5550100",
      "5550101",
      "5550102",
      "s@example.com",
      "lot@example.com",
    ]) {
      expect(raw).not.toContain(v);
    }
    expect(out.options).not.toHaveProperty("contact");
    expect(out.options.seller).toEqual({ name: "Lot 9" });
    expect(out.options.auction).toEqual({ bidCount: 3 });
    expect(out.options.sellerType).toBe("dealer");
  });

  it("flip desk keeps options untouched", () => {
    const items = [{ id: "d", options }];
    expect(listingsForDesk(items, true)[0]).toBe(items[0]);
  });

  it("does not mutate the input", () => {
    const card = { id: "d", options };
    redactListingForNonFlipDesk(card);
    expect(card.options.contact.phone).toBe("5550100");
  });
});

describe("safeOptions is recursive with a depth cap", () => {
  it("strips contact keys at any depth and inside arrays", () => {
    const out = redactListingForNonFlipDesk({
      id: "d",
      options: {
        lots: [{ seller: { phone: "5550199", name: "A" } }, { email: "x@y.z" }],
        a: { b: { c: { contact: { phone: "5550198" }, keep: 1 } } },
      },
    } as any) as any;
    const raw = JSON.stringify(out);
    expect(raw).not.toContain("5550199");
    expect(raw).not.toContain("5550198");
    expect(raw).not.toContain("x@y.z");
    expect(out.options.lots[0].seller).toEqual({ name: "A" });
    expect(out.options.a.b.c).toEqual({ keep: 1 });
  });

  it("drops subtrees past depth 5 instead of passing them through", () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { phone: "5550197" } } } } } };
    const out = redactListingForNonFlipDesk({
      id: "d",
      options: deep,
    } as any) as any;
    expect(JSON.stringify(out)).not.toContain("5550197");
  });

  it("card redaction drops snake_case seller_phone / seller_email", () => {
    const out = redactListingForNonFlipDesk({
      id: "d",
      seller_phone: "5550196",
      seller_email: "s@x.y",
      seller_contact_url: "https://seller",
    } as any);
    expect(out).not.toHaveProperty("seller_phone");
    expect(out).not.toHaveProperty("seller_email");
    expect(out).not.toHaveProperty("seller_contact_url");
  });
});

describe("safeOptions sensitive-key coverage", () => {
  it("drops e-mail / tel / mobile / cell / whatsapp keys at any depth", () => {
    const out = redactListingForNonFlipDesk({
      id: "d",
      options: {
        "e-mail": "a@b.c",
        tel: "5550101",
        seller: {
          mobile: "5550102",
          Cell_Number: "5550103",
          whatsApp: "5550104",
        },
        list: [{ WhatsApp_Link: "https://wa.me/5550105" }],
        hotel_parking: "lot B",
        trim: "EX-L",
      },
    } as any) as any;
    const raw = JSON.stringify(out);
    for (const leak of [
      "a@b.c",
      "5550101",
      "5550102",
      "5550103",
      "5550104",
      "5550105",
    ]) {
      expect(raw).not.toContain(leak);
    }
    // \btel\b must not eat unrelated keys like hotel_*.
    expect(out.options.hotel_parking).toBe("lot B");
    expect(out.options.trim).toBe("EX-L");
  });
});
