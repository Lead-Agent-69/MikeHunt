import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AdvisorCardView } from "@/components/intelligence/AdvisorCard";
import type { AdvisorView } from "@/lib/intelligence/advisor-view";

const ready = (over: Partial<Extract<AdvisorView, { state: "ready" }>> = {}): AdvisorView => ({
  state: "ready", verdict: "wait", word: "Wait", headline: "Close: offer $11,400 or less.",
  buyCeiling: { value: 11400, basisLabel: "estimate from live asks" },
  fairValue: { value: 11400, basisLabel: "estimate from live asks" },
  profit: null, sellMarket: null, confidence: "high", confidenceNote: null, breakdown: [],
  why: ["9 comparable cars listed nearby."], assumptions: [], compsLine: "Based on 9 comparable cars (9 listed).",
  ...over,
});
const html = (view: AdvisorView) => renderToStaticMarkup(React.createElement(AdvisorCardView, { view }));

describe("AdvisorCard (Sara's layout)", () => {
  it("renders Not enough data with no verdict or price, and no branding", () => {
    const out = html({ state: "insufficient", headline: "Not enough data", reason: "Too few comparable cars to price this one." });
    expect(out).toContain("Not enough data");
    expect(out).not.toMatch(/\$\d/);
    expect(out).not.toMatch(/data-verdict/);
    expect(out).not.toContain("MikeHunt read");
  });

  it("orders verdict pill, then Buy at or under, then headline, then Fair value", () => {
    const out = html(ready());
    const at = (s: string) => out.indexOf(s);
    expect(at('data-verdict="wait"')).toBeGreaterThan(-1);
    expect(at('data-verdict="wait"')).toBeLessThan(at("Buy at or under"));
    expect(at("Buy at or under")).toBeLessThan(at("Close: offer"));
    expect(at("Close: offer")).toBeLessThan(at("Fair value"));
    expect(out).not.toContain("Profit");
    expect(out).not.toContain("MikeHunt read");
  });

  it("Pass is neutral: word in --t1, icon tinted, no red block", () => {
    const out = html(ready({ verdict: "pass", word: "Pass" }));
    expect(out).toMatch(/text-\[var\(--t1\)\][^>]*data-verdict="pass"/);
    expect(out).not.toMatch(/background:\s*var\(--red\)/);
    expect(out).toContain("<svg");
  });

  it("medium confidence shows a small caveat", () => {
    expect(html(ready({ confidence: "medium", confidenceNote: "Medium confidence" }))).toContain("Medium confidence");
  });

  it("flip desk shows Profit · sell in {state} and the collapsed math", () => {
    const out = html(ready({
      verdict: "buy", word: "Buy",
      profit: { value: 2100, basisLabel: "estimate from live asks" },
      sellMarket: { value: 14900, basisLabel: "estimate from live asks", state: "TX" },
      breakdown: [
        { label: "Buy", value: 9500, sign: "-" },
        { label: "Expected sale in TX", value: 14900, sign: "+" },
        { label: "Profit", value: 2100, sign: "=" },
      ],
    }));
    expect(out).toContain("Profit · sell in TX");
    expect(out).toContain('data-testid="advisor-breakdown"');
    expect(out).toContain("Expected sale in TX");
  });

  it("deal detail renders the card with an isFlipBuyerMode desk gate", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(page).toContain("<AdvisorCard");
    expect(page).toMatch(/isFlipBuyerMode\(\s*readLocalBuyerIntent\(\)\?\.buyerMode \|\| prefs\.buyerScope\?\.buyerMode/);
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
