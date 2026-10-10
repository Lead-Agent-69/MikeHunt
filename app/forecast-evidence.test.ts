import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForecastPanel } from "@/components/deal/ForecastPanel";
import { predict } from "@/lib/intelligence/predict";

describe("forecast evidence honesty", () => {
  it("does not present rule-based probabilities or times as measured forecasts", () => {
    const prediction = predict({
      marketSupply: 4,
      daysOnMarket: 80,
      priceVsMarket: 1.3,
      isBuy: true,
    });
    const html = renderToStaticMarkup(
      React.createElement(ForecastPanel, { prediction }),
    );
    expect(html).toContain("not calibrated against completed sales");
    expect(html).toContain("Sparse supply");
    expect(html).toContain("Price pressure signal");
    expect(html).not.toContain("price-drop odds");
    expect(html).not.toMatch(/ACT NOW|MOVE SOON|~10d|92%|likely to drop/);
  });
});
