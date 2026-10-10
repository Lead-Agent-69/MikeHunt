import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { VehicleSourceAction } from "@/components/deal/VehicleSourceAction";

it("uses channel-correct source actions without implying a purchase", () => {
  const html = renderToStaticMarkup(
    createElement(VehicleSourceAction, {
      sourceUrl: "https://www.copart.com/lot/123",
      auction: true,
    }),
  );
  expect(html).toContain("View auction");
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("opens in a new tab");
  expect(html).not.toContain("Buy now");
});

it("shows a retail listing action and prevents unsafe or missing links", () => {
  expect(
    renderToStaticMarkup(
      createElement(VehicleSourceAction, {
        sourceUrl: "https://dealer.example/car/1",
      }),
    ),
  ).toContain("View listing");
  for (const sourceUrl of [null, "", "javascript:alert(1)"]) {
    const html = renderToStaticMarkup(
      createElement(VehicleSourceAction, { sourceUrl }),
    );
    expect(html).toContain("disabled");
    expect(html).not.toContain("href=");
  }
});

it("does not present a seller homepage as a vehicle listing", () => {
  const html = renderToStaticMarkup(
    createElement(VehicleSourceAction, {
      sourceUrl: "https://www.alanjay.com/",
    }),
  );
  expect(html).toContain("Seller website");
  expect(html).not.toContain("View listing");
});
