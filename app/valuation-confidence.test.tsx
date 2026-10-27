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
    expect(content.textContent).toContain("Asking-price reference");
    expect(content.textContent).not.toContain("Resale estimate");
    expect(content.textContent).not.toContain("Clean market value");
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
  it("requires current dated clean-sale evidence before labeling a resale estimate", () => {
    const sale = {
      ...example,
      confidence: "high" as const,
      soldCount: 3,
      soldAnchored: true,
      soldLane: "clean" as const,
      soldAt: new Date().toISOString(),
      compKind: "sold" as const,
    };
    expect(
      renderToStaticMarkup(
        <ValuationBreakdown v={sale} sellEstimate={34054} />,
      ),
    ).toContain("Resale estimate");
    for (const change of [
      { soldAt: null },
      { soldAt: "2000-01-01" },
      { soldLane: "salvage" as const },
      { soldCount: 0 },
    ])
      expect(
        renderToStaticMarkup(
          <ValuationBreakdown
            v={{ ...sale, ...change }}
            sellEstimate={34054}
          />,
        ),
      ).not.toContain("Resale estimate");
  });
});
