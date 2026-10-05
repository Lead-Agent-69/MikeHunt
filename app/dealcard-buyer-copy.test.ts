import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

import { DealCard } from "@/components/shared/DealCard";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Auction lot, modeled valuation, missing VIN/mileage → exercises price label, basis rows, checks.
const lot = {
  id: "deal-9",
  source: "copart",
  year: 2021,
  make: "Mazda",
  model: "CX-5",
  askPrice: 14000,
  mmrValue: 17000,
  sellEstimate: 17000,
  profitEstimate: 1800,
  recommendedMaxBid: 14500,
};

const render = (flipDesk: boolean) =>
  renderToStaticMarkup(createElement(DealCard, { ...lot, flipDesk }));

describe("DealCard wording by buyer desk", () => {
  it("keeps flip vocabulary for reseller / dealer desks", () => {
    const html = render(true);
    expect(html).toContain("Current bid");
    expect(html).toContain("Resale basis");
    expect(html).toContain("resale basis");
    expect(html).toContain("Tighten before bidding:");
  });

  it("uses buyer copy for non-flip desks", () => {
    const html = render(false);
    expect(html).not.toMatch(/resale/i);
    expect(html).not.toMatch(/before bidding/i);
    expect(html).not.toContain("Current bid");
    expect(html).not.toMatch(/drive (an aggressive )?(a )?bid/i);
    expect(html).toContain("Current price");
    expect(html).toContain("Market value");
    expect(html).toContain("market value");
    expect(html).toContain("Check before you buy:");
  });
});

describe("dealCardCopy", () => {
  it("only rewrites the auction price label for non-flip buyers", () => {
    expect(dealCardCopy(false).priceLabel("copart")).toBe("Current price");
    expect(dealCardCopy(true).priceLabel("copart")).toBe("Current bid");
    expect(dealCardCopy(false).priceLabel("craigslist")).toBe(
      dealCardCopy(true).priceLabel("craigslist"),
    );
  });

  it("drops resale / bidding words from every non-flip string", () => {
    const c = dealCardCopy(false);
    const strings = [
      c.basisNoun,
      c.basisRowLabel,
      c.basisLabel(true, true),
      c.basisLabel(false, true),
      c.basisLabel(false, false),
      ...[
        "comparables",
        "third_party",
        "historical_estimate",
        "asking_price",
        undefined,
      ].map((s) => c.basisTitle(s)),
      c.compBackedPrefix,
      c.basisMissing,
      c.basisMissingShort,
      c.checksPrefix,
      c.confidenceReview,
      c.confidenceThin,
      c.historicalNote,
      c.modeledNote,
    ];
    for (const s of strings) expect(s).not.toMatch(/resale|\bbid(ding)?\b/i);
  });
});
