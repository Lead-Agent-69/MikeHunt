import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ValuationBreakdown } from "@/components/deal/ValuationBreakdown";
import type { ValuationBreakdown as Evidence } from "@/lib/scoring/deal-analyzer";

const example: Evidence = {
  basis: "comps",
  source: "comparables",
  confidence: "low",
  sampleCount: 5,
  compCount: 5,
  compConfidence: "low",
  cleanComp: 36019,
  soldCount: 0,
  soldAnchored: false,
  kbbValue: null,
  mileageMult: 0.983,
  titleMult: 1,
  titleTag: "clean",
  baseline: 36019,
  compScope: "index",
  compKind: "ask",
  resaleEvidence: true,
};

describe("vehicle valuation confidence display", () => {
  it("renders low confidence for the five-asking-comparison production example", () => {
    const html = renderToStaticMarkup(
      <ValuationBreakdown v={example} sellEstimate={34054} mileage={9677} />,
    );
    const content = document.createElement("div");
    content.innerHTML = html;
    expect(content.textContent).toContain("Low confidence");
    expect(content.textContent).not.toContain("Good confidence");
    expect(content.textContent).toContain("Seller asking prices, not sales");
  });
  it("does not label a missing confidence record as high from a legacy sold flag", () => {
    const legacy = {
      ...example,
      soldAnchored: true,
      confidence: undefined,
    } as unknown as Evidence;
    const html = renderToStaticMarkup(
      <ValuationBreakdown v={legacy} sellEstimate={34054} />,
    );
    const content = document.createElement("div");
    content.innerHTML = html;
    expect(content.textContent).toContain("Unrated confidence");
    expect(content.textContent).not.toContain("High confidence");
  });
});
