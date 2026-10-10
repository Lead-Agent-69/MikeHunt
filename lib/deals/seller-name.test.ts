import { describe, expect, it } from "vitest";
import { looksLikeContact, safeSellerName, sellerForDesk } from "./seller-name";

describe("safeSellerName", () => {
  it("keeps real names", () => {
    expect(safeSellerName("Jane Q. Private")).toBe("Jane Q. Private");
    expect(safeSellerName("  AutoNation  Ford ")).toBe("AutoNation Ford");
    expect(safeSellerName("Cars.com")).toBe("Cars.com");
    expect(safeSellerName("Dealer 2024")).toBe("Dealer 2024");
    expect(safeSellerName({ name: "Jane", phone: "512-555-0142" })).toBe(
      "Jane",
    );
  });
  it.each([
    "512-555-0142",
    "(512) 555 0142",
    "+1 512.555.0142",
    "Call 5125550142",
    "jane@example.com",
    "jane [at] example dot com",
    "@janeflips",
    "https://fb.com/jane",
    "www.janescars.example",
  ])("drops contact-shaped %s", (value) => {
    expect(looksLikeContact(value)).toBe(true);
    expect(safeSellerName(value)).toBeUndefined();
  });
  it("drops non-strings and objects without a name", () => {
    expect(safeSellerName(undefined)).toBeUndefined();
    expect(safeSellerName(42)).toBeUndefined();
    expect(safeSellerName({ phone: "5125550142" })).toBeUndefined();
    expect(safeSellerName({ name: "jane@example.com" })).toBeUndefined();
  });
});

describe("sellerForDesk", () => {
  const card = {
    id: "c",
    seller: "Jane Q. Private",
    sellerName: "Jane Q. Private",
    sellerType: "private",
    seller_whatsapp: "5125550142",
  };
  it("non-flip: no seller name and no contact-shaped key", () => {
    const out = sellerForDesk(card, false);
    expect(out.seller).toBeUndefined();
    expect(out.sellerName).toBeUndefined();
    expect(out).not.toHaveProperty("seller_whatsapp");
    expect(out.sellerType).toBe("private");
    expect(card.seller).toBe("Jane Q. Private"); // input untouched
  });
  it("flip: keeps a scrubbed name only", () => {
    expect(sellerForDesk(card, true).seller).toBe("Jane Q. Private");
    expect(sellerForDesk({ seller: "512-555-0142" }, true)).not.toHaveProperty(
      "seller",
    );
  });
});
