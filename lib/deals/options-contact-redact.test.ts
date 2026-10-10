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
