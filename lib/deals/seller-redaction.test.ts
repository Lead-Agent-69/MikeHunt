// Seller identity redaction (Ren's lineage review: options.seller leaked to guests).
import { describe, expect, it } from "vitest";
import {
  redactDealForNonFlipDesk,
  redactListingForNonFlipDesk,
  redactSellerForGuest,
} from "./deal-desk-access";

const deal = {
  id: "d1",
  seller: "Jane Q. Private",
  sellerName: "Jane Q. Private",
  sellerUrl: "https://fb.example/profile/123",
  options: {
    seller: {
      name: "Jane Q. Private",
      address: "12 Elm St",
      phone: "555-0100",
    },
    sellerType: "private",
    titleSource: "listing",
  },
  alsoOn: [
    {
      id: "d2",
      seller: "Jane Q. Private",
      options: { seller: { name: "Jane" } },
    },
  ],
};

describe("seller redaction", () => {
  it("a signed-in non-flip desk keeps the seller name but never its contact", () => {
    for (const out of [
      redactDealForNonFlipDesk(deal),
      redactListingForNonFlipDesk(deal),
    ]) {
      // Ren #308 P3: name only, as a string (no address, profile link or contact).
      expect(out.options.seller).toBe("Jane Q. Private");
      expect(out.options.sellerType).toBe("private");
    }
  });

  it("a guest gets no seller identity at all", () => {
    const out = redactSellerForGuest(redactDealForNonFlipDesk(deal));
    expect(out.seller).toBeUndefined();
    expect(out.sellerName).toBeUndefined();
    expect(out.sellerUrl).toBeUndefined();
    expect(out.options.seller).toBeUndefined();
    expect(out.options.sellerType).toBe("private");
    const raw = redactSellerForGuest(deal);
    expect(raw.options.seller).toBeUndefined();
    expect(raw.alsoOn[0].seller).toBeUndefined();
    expect(raw.alsoOn[0].options.seller).toBeUndefined();
  });

  it("never mutates the input", () => {
    redactSellerForGuest(deal);
    redactDealForNonFlipDesk(deal);
    expect(deal.options.seller.name).toBe("Jane Q. Private");
    expect(deal.seller).toBe("Jane Q. Private");
  });

  it("/api/deals/[id] applies the guest redaction when signed out", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/deals/[id]/route.ts", "utf8");
    expect(src).toContain(
      "user?.id ? deskPayload : redactSellerForGuest(deskPayload)",
    );
  });
});
