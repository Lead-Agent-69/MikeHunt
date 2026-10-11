import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { MarketTiming } from "@/components/deal/MarketTiming";
import { BestTimeToBuy } from "@/components/deal/BestTimeToBuy";

const response = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("swr", () => ({ default: () => response }));
const render = () =>
  renderToStaticMarkup(
    React.createElement(MarketTiming, { make: "Ford", model: "F-150" }),
  );

it("labels an adequately sampled ask trend without recommending purchase", () => {
  response.data = {
    timing_signal: "BUY_NOW",
    data_points: 12,
    pct_change_30d: 7,
  };
  const html = render();
  expect(html).toContain("Asking prices rising");
  expect(html).toContain("12 listings");
  expect(html).toContain("recent vs prior observations");
  expect(html).toContain("not a purchase recommendation");
  expect(html).not.toContain("Buy now");
});
it.each([0, 4, NaN, undefined])(
  "hides unsupported timing for sample count %s",
  (count) => {
    response.data = { timing_signal: "BUY_NOW", data_points: count };
    expect(render()).toBe("");
  },
);
it("keeps valid logged outcomes separate from insufficient ask evidence", () => {
  response.data = {
    timing_signal: "BUY_NOW",
    data_points: 0,
    avg_days_to_sell: 21,
  };
  expect(render()).toContain("21d average in logged outcomes");
  expect(render()).not.toContain("Asking prices rising");
  response.data = { avg_days_to_sell: -1 };
  expect(render()).toBe("");
});
it("labels seasonal heuristics and makes every month distinguishable", () => {
  const html = renderToStaticMarkup(
    React.createElement(BestTimeToBuy, { make: "Ford", model: "F-150" }),
  );
  expect(html).toContain("General seasonal heuristic");
  expect(html).not.toContain("Good time now");
  expect(html).not.toContain("Better in");
  for (const month of [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]) {
    expect(html).toContain(`>${month}</span>`);
  }
});
it("places cross-source market context with market evidence, not the advanced grid", () => {
  const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
  const market = page.indexOf('eyebrow="Market evidence"');
  const plan = page.indexOf('eyebrow="Plan and record"');
  const context = page.indexOf("<MarketContext dealId={id} />");
  expect(context).toBeGreaterThan(market);
  expect(context).toBeLessThan(plan);
  expect(page.match(/<MarketContext dealId=\{id\} \/>/g)).toHaveLength(1);
  expect(page).toMatch(/\{serverDeal && \(\s*<ContactSeller/);
});
