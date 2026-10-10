import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlsoSearchOn } from "./AlsoSearchOn";

describe("AlsoSearchOn", () => {
  it("asks for a make before showing links", () => {
    const html = renderToStaticMarkup(createElement(AlsoSearchOn));
    expect(html).toContain("Enter a make");
  });

  it("renders new-tab outbound links, never Carvana or Visor", () => {
    const html = renderToStaticMarkup(
      createElement(AlsoSearchOn, {
        initial: {
          make: "Honda",
          model: "Civic",
          yearMin: 2018,
          yearMax: 2022,
          priceMax: 25000,
          zip: "60601",
          radiusMi: 50,
        },
      }),
    );
    const hrefs = (html.match(/href="[^"]+"/g) || []).map((m) =>
      m.slice(6, -1),
    );
    expect(hrefs.length).toBeGreaterThan(3);
    expect(hrefs.some((h) => h.includes("cars.com"))).toBe(true);
    expect(html).not.toMatch(/carvana|visor/i);
    expect((html.match(/target="_blank"/g) || []).length).toBe(hrefs.length);
    expect(html).toContain("noopener");
  });
});
