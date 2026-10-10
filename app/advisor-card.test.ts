import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AdvisorCardView } from "@/components/intelligence/AdvisorCard";

describe("AdvisorCard", () => {
  it("renders Not enough data with no verdict or price", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdvisorCardView, {
        view: {
          state: "insufficient",
          headline: "Not enough data",
          reason: "Too few comparable cars to price this one.",
        },
      }),
    );
    expect(html).toContain("Not enough data");
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toMatch(/>(Buy|Wait|Pass)</);
  });

  it("personal view shows Buy ≤ and fair value only", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdvisorCardView, {
        view: {
          state: "ready",
          verdict: "wait",
          word: "Wait",
          headline: "Close: offer $11,400 or less.",
          buyCeiling: { value: 11400, basisLabel: "estimate from live asks" },
          fairValue: { value: 11400, basisLabel: "estimate from live asks" },
          profit: null,
          sellMarket: null,
          confidence: "medium",
          why: ["9 comparable cars listed nearby."],
          assumptions: [],
          compsLine: "Based on 9 comparable cars (9 listed).",
        },
      }),
    );
    expect(html).toContain("Wait");
    expect(html).toContain("Buy ≤");
    expect(html).toContain("Fair value");
    expect(html).not.toContain("Profit");
    expect(html).not.toContain(">Sell<");
  });

  it("deal detail renders the card with an isFlipBuyerMode desk gate", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(page).toContain("<AdvisorCard");
    expect(page).toMatch(
      /isFlipBuyerMode\(\s*readLocalBuyerIntent\(\)\?\.buyerMode \|\| prefs\.buyerScope\?\.buyerMode/,
    );
  });
});

describe("DealCard advisor summary", () => {
  it("is tap-to-check and gates profit on isFlipBuyerMode as well as the card's desk", () => {
    const src = readFileSync(
      "components/intelligence/AdvisorSummary.tsx",
      "utf8",
    );
    expect(src).toContain("useAdvisorRead(asked ? body : null)");
    expect(src).toMatch(/flipDesk &&\s*isFlipBuyerMode\(/);
    const card = readFileSync("components/shared/DealCard.tsx", "utf8");
    expect(card).toContain("<AdvisorSummary");
  });
});
