import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  ComparableInspector,
  type ComparablePoint,
} from "@/components/deal/ComparableInspector";
const current = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const point: ComparablePoint = {
  key: other,
  id: other,
  x: 40000,
  y: 15000,
  me: false,
  name: "2018 Honda Accord",
  source: "independent_dealer",
  location: "St. Louis, MO",
  priceLabel: "Unverified advertised amount",
};
const render = (fields = {}) =>
  renderToStaticMarkup(
    React.createElement(ComparableInspector, {
      point: { ...point, ...fields },
      points: [point],
      dealId: current,
      onSelect: () => {},
    }),
  );
it("preserves exact price meaning and uses confirmed identifiers for deep links", () => {
  const html = render();
  expect(html).toContain("Unverified advertised amount");
  expect(html).toContain("$15,000");
  expect(html).toContain("40,000 mi");
  expect(html).toContain(`href="/deal/${other}"`);
  expect(html).toContain(`href="/compare?ids=${current},${other}"`);
  expect(html).toContain('aria-live="polite"');
  expect(html).not.toMatch(/better buy|profit|resale value/i);
});
it.each([undefined, "javascript:alert(1)", "../admin", "not-a-vehicle"])(
  "does not create navigation from malformed identifiers: %s",
  (id) => {
    expect(render({ id })).not.toContain("href=");
  },
);
it("does not add a pointless self-comparison or self-navigation", () => {
  expect(render({ id: current, me: true })).not.toContain("href=");
});
