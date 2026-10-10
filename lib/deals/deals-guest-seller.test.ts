import { describe, expect, it, vi } from "vitest";

// Ren P2 on #328: /api/deals/[id] and the /api/deals list gave guests the raw seller string
// (deals-service mapper: row.seller || options.seller) and options.seller. Same rule as
// sellerForDesk: flip desks keep a scrubbed NAME only; guests / non-flip desks get no seller at all.
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from: vi.fn() }),
  isSupabaseConfigured: () => true,
}));

import { DealsService } from "@/lib/data/deals-service";
import {
  listingsForDesk,
  redactDealForNonFlipDesk,
  redactListingForNonFlipDesk,
} from "@/lib/deals/deal-desk-access";
import { sellerForDesk } from "@/lib/deals/seller-name";

const map = (row: Record<string, unknown>) =>
  (new DealsService() as any).mapDbToDeal({
    id: "d1",
    source: "craigslist",
    ask_price: 5000,
    ...row,
  });

const SELLER_KEYS = ["seller", "sellerName", "seller_name"];
function expectNoSellerIdentity(out: Record<string, any>) {
  for (const k of SELLER_KEYS) expect(out).not.toHaveProperty(k);
  const json = JSON.stringify(out);
  expect(json).not.toMatch(/757-555-0142|bob\.smith@|Jane Private/);
}

describe("deals-service mapper: seller is a scrubbed name, never contact", () => {
  it("keeps a plain seller name", () => {
    expect(map({ seller: "Smith Motors" }).seller).toBe("Smith Motors");
  });
  it("drops a phone / email / link stored as the seller", () => {
    expect(map({ seller: "757-555-0142" }).seller).toBeUndefined();
    expect(map({ seller: "bob.smith@norfolk.gov" }).seller).toBeUndefined();
    expect(map({ seller: "https://fb.me/jane" }).seller).toBeUndefined();
  });
  it("reads options.seller by name only, never its contact keys", () => {
    const d = map({
      options: { seller: { name: "Jane Private", phone: "757-555-0142" } },
    });
    expect(d.seller).toBe("Jane Private");
    expect(JSON.stringify(d)).not.toContain("757-555-0142".replace(/-/g, ""));
    expect(map({ options: { seller: "757-555-0142" } }).seller).toBeUndefined();
  });
});

describe("non-flip redaction strips seller identity (deal page + cards)", () => {
  const deal = {
    id: "d1",
    title: "2015 Honda Civic",
    seller: "Jane Private",
    sellerName: "Jane Private",
    seller_name: "Jane Private",
    sellerType: "private",
    options: {
      seller: { name: "Jane Private", phone: "757-555-0142" },
      sellerInfo: { email: "bob.smith@norfolk.gov" },
      titleSource: "listing",
    },
  };

  it("/api/deals/[id] guest payload (redactDealForNonFlipDesk)", () => {
    const out = redactDealForNonFlipDesk(deal);
    expectNoSellerIdentity(out);
    expect(out.options).toEqual({ titleSource: "listing" });
    expect(out.sellerType).toBe("private"); // seller TYPE is a listing fact, kept
    expect(deal.seller).toBe("Jane Private"); // input not mutated
    expect(deal.options.seller).toBeDefined();
  });

  it("/api/deals list guest payload (listingsForDesk → redactListingForNonFlipDesk)", () => {
    const [out] = listingsForDesk([deal], false);
    expectNoSellerIdentity(out as Record<string, any>);
    expect((out as any).options).toEqual({ titleSource: "listing" });
    expect(redactListingForNonFlipDesk(deal)).toEqual(out);
  });

  it("nested alsoOn / bulk deals rows are stripped too", () => {
    const out = redactListingForNonFlipDesk({
      id: "g",
      alsoOn: [deal],
      deals: [deal],
    });
    expectNoSellerIdentity(out.alsoOn[0]);
    expectNoSellerIdentity(out.deals[0]);
  });

  it("matches sellerForDesk(card, false) on seller keys", () => {
    const viaDesk = sellerForDesk(deal, false);
    const viaRedact = redactListingForNonFlipDesk(deal);
    for (const k of SELLER_KEYS) {
      expect(k in viaDesk).toBe(false);
      expect(k in viaRedact).toBe(false);
    }
  });

  it("flip desks are untouched by the redaction path (listingsForDesk passes through)", () => {
    const [out] = listingsForDesk([{ ...deal, seller: "Smith Motors" }], true);
    expect((out as any).seller).toBe("Smith Motors");
  });
});
