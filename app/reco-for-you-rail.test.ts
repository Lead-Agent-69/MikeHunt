import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forYouCards, forYouHonestyMessage } from "@/components/reco/for-you";
import type { DiscoveryDeal } from "@/components/discovery/types";

const item = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  source: "craigslist",
  title: "2018 Honda Civic",
  year: 2018,
  make: "Honda",
  model: "Civic",
  askPrice: 12000,
  sellEstimate: 14000,
  trueNetProfit: 1500,
  profitScore: 72,
  recommendedMaxBid: 11000,
  sellerPhone: "555-0100",
  dealAnalysis: { costs: { transport: 300 } },
  images: ["https://img.example/1.jpg"],
  locationState: "TX",
  forYouReason: "You looked at 3 Honda Civic",
  slot: "affinity",
};

describe("For You rail data", () => {
  it("stays hidden unless the backend is personalizing", () => {
    expect(forYouCards(null, false)).toEqual([]);
    expect(forYouCards(undefined, true)).toEqual([]);
    expect(
      forYouCards({ items: [], personalized: false, configured: false }, true),
    ).toEqual([]);
    // deal_signals missing → no signals → personalized:false even with fresh items
    expect(forYouCards({ items: [item], personalized: false }, true)).toEqual(
      [],
    );
    expect(forYouCards({ items: [], personalized: true }, true)).toEqual([]);
  });

  it("drops rows without an id, photo or price", () => {
    const cards = forYouCards(
      {
        personalized: true,
        items: [
          item,
          { ...item, id: undefined },
          { ...item, id: "b", images: [] },
          { ...item, id: "c", askPrice: 0 },
        ],
      },
      true,
    );
    expect(cards.map((c) => c.id)).toEqual([item.id]);
  });

  it("keeps flip economics for flip desks and shows the reason", () => {
    const [card] = forYouCards({ personalized: true, items: [item] }, true);
    expect(card.trueNetProfit).toBe(1500);
    expect(card.recommendedMaxBid).toBe(11000);
    expect(card.winReason).toBe("You looked at 3 Honda Civic");
    expect(card.listingCount).toBe(1);
  });

  it("redacts profit, max bid, seller contact and analysis for non-flip desks", () => {
    const [card] = forYouCards({ personalized: true, items: [item] }, false);
    const c = card as unknown as Record<string, unknown>;
    for (const k of [
      "trueNetProfit",
      "profitScore",
      "recommendedMaxBid",
      "sellerPhone",
      "dealAnalysis",
    ])
      expect(c[k]).toBeUndefined();
    expect(card.askPrice).toBe(12000);
    expect(card.winReason).toBe("You looked at 3 Honda Civic");
  });

  it("the client field list matches the server's flip-only list", () => {
    const server = readFileSync("lib/deals/deal-desk-access.ts", "utf8");
    const block = server.slice(
      server.indexOf("const CARD_FLIP_ONLY_FIELDS = ["),
      server.indexOf("] as const;", server.indexOf("CARD_FLIP_ONLY_FIELDS")),
    );
    const fields = Array.from(block.matchAll(/"([a-zA-Z_]+)"/g)).map(
      (m) => m[1],
    );
    const client = readFileSync("components/reco/for-you.ts", "utf8");
    for (const f of fields) expect(client).toContain(`"${f}"`);
  });

  it("Discover mounts the rail with the current desk", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    expect(page).toContain("flipDesk={flipDesk}");
    expect(page).toContain("eligibleDeals={eligibleDeals}");
    expect(page).toContain("hasRankingChoices &&");
    expect(page).toContain("distinctDiscoveryRails(");
    expect(page).toContain("!isValidating && !error");
  });

  it("never widens the current search with auction, over-budget or wrong-state recommendations", () => {
    const eligible = {
      ...item,
      titleClass: "salvage",
      grade: "unknown",
      discountPct: 0,
      gradeLabel: "",
      alsoOn: [],
      listingCount: 1,
      warnings: ["Inspection needed"],
    } as DiscoveryDeal;
    const cards = forYouCards(
      {
        personalized: true,
        items: [
          item,
          { ...item, id: "auction", source: "copart" },
          { ...item, id: "over-budget", askPrice: 90000 },
          { ...item, id: "wrong-state", locationState: "MO" },
        ],
      },
      false,
      [eligible],
    );
    expect(cards.map((card) => card.id)).toEqual([item.id]);
    expect(cards[0].titleClass).toBe("salvage");
    expect(cards[0].warnings).toEqual(["Inspection needed"]);
    expect(cards[0].trueNetProfit).toBeUndefined();
    expect(
      forYouCards({ personalized: true, items: [item] }, true, []),
    ).toEqual([]);
  });

  it("does not read browser storage during the initial Discover render", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    const renderScope = page.slice(
      page.indexOf("const urlScope ="),
      page.indexOf("const router ="),
    );
    expect(renderScope).not.toContain("readLocalBuyerIntent()");
    expect(renderScope).toContain("resolveBuyerIntentScope(");
    expect(renderScope).toContain("vehicles: []");
  });

  it("soft honesty for cold-start and missing signals; hide when unsigned/unconfigured", () => {
    expect(forYouHonestyMessage(null)).toBeNull();
    expect(forYouHonestyMessage(undefined)).toBeNull();
    expect(
      forYouHonestyMessage({ personalized: false, configured: false }),
    ).toBeNull();
    expect(
      forYouHonestyMessage({
        personalized: false,
        signalsAvailable: false,
      }),
    ).toMatch(/signals not configured/i);
    expect(
      forYouHonestyMessage({
        personalized: false,
        signalsAvailable: true,
      }),
    ).toMatch(/nothing personalized yet/i);
    expect(
      forYouHonestyMessage({ personalized: true, signalsAvailable: true }),
    ).toBeNull();
  });

  it("deal detail mounts Find similar CTA + FindSimilarModal", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(page).toContain("FindSimilarModal");
    expect(page).toContain('data-testid="find-similar-cta"');
    expect(page).toContain('data-testid="find-similar-cta-bar"');
    expect(page).toContain('data-testid="find-similar-cta-rail"');
    expect(page).toContain("Find similar vehicles in collected inventory");
    expect(page).not.toContain("Find similar vehicles in saved inventory");
    expect(page).toContain('flipDesk={store.userType === "dealer"}');
  });

  it("/for-you and /flash redirect to Discover / flash-deals", () => {
    const forYou = readFileSync("app/(dashboard)/for-you/page.tsx", "utf8");
    const flash = readFileSync("app/(dashboard)/flash/page.tsx", "utf8");
    expect(forYou).toContain('redirect("/discover")');
    expect(flash).toContain('redirect("/flash-deals")');
  });
});
