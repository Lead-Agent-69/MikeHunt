import { describe, it, expect } from "vitest";
import { categorize, dealGrade } from "./categorize";

// A $20k-market car with a $4k OPENING bid must not be badged "75% off — Great Deal": the bid will rise.
// Grading an auction against the realistic acquisition cost (recommended max bid) keeps it honest.
describe("auction-aware grading", () => {
  const market = 20000;

  it("retail listing grades off its (fixed) ask price", () => {
    const t = categorize({
      source: "carvana",
      ask_price: 15000,
      sell_estimate: market,
      sellBasis: "comps",
    });
    // 25% below market → great, as before.
    expect(t.grade).toBe("great");
    expect(t.discountPct).toBe(25);
  });

  it("auction grades off the realistic max bid, not the opening bid", () => {
    const opening = categorize({
      source: "copart",
      ask_price: 4000, // opening bid
      recommended_max_bid: 14000, // engine's disciplined max
      sell_estimate: market,
      sellBasis: "comps",
    });
    // Graded against $14k (not $4k): ~30% — honest, not a fake 80%.
    expect(opening.discountPct).toBe(30);
    // The raw opening-bid discount would have been 80% — make sure we did NOT use that.
    expect(opening.discountPct).not.toBe(80);
  });

  it("an overheated auction (bid above max) grades down honestly", () => {
    const hot = categorize({
      source: "copart",
      ask_price: 19000, // bid already near market
      recommended_max_bid: 14000,
      sell_estimate: market,
      sellBasis: "comps",
    });
    // Uses the higher of bid vs max → $19k → only 5% → not a "great" deal anymore.
    expect(hot.discountPct).toBe(5);
    expect(hot.grade).not.toBe("great");
  });

  it("dealGrade math is unchanged for direct callers", () => {
    expect(dealGrade(15000, 20000).grade).toBe("great");
  });

  it("does not treat an asking-price haircut as a great or good deal", () => {
    // ask × 1.15 is the analyzer's high-confidence ceiling — ~13% "discount", which is "good"
    // if graded as market. The source is the ask itself, so there is no comp to invent.
    const haircut = categorize({
      source: "cars_com",
      ask_price: 20000,
      sell_estimate: Math.round(20000 * 1.15),
      sellBasis: "market",
      valuationSource: "asking_price",
    });
    expect(haircut.grade).not.toBe("great");
    expect(haircut.grade).not.toBe("good");
    expect(haircut.discountPct).toBe(0);

    const fromRow = categorize({
      source: "cars_com",
      ask_price: 20000,
      sell_estimate: Math.round(20000 * 1.15),
      sellBasis: "market",
      deal_analysis: { valuation: { source: "asking_price" } },
    });
    expect(fromRow.grade).not.toBe("good");
    expect(fromRow.grade).not.toBe("great");

    const realMarket = categorize({
      source: "cars_com",
      ask_price: 17000,
      sell_estimate: 20000,
      sellBasis: "market",
      valuationSource: "historical_estimate",
    });
    expect(realMarket.grade).toBe("good");
    expect(realMarket.discountPct).toBe(15);
  });
});
