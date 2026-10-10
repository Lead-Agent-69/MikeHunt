// The sold-comps UI (components/deal/RecentlySold) shows /api/sold's govLane with its source credits.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GovLane } from "@/components/deal/RecentlySold";

const CC =
  "GovAuctions.app GSA dataset, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)";
const render = (lane: any) =>
  renderToStaticMarkup(createElement(GovLane, { lane }));

describe("GovLane (gov auction results with source credits)", () => {
  it("shows each row's price meaning and the CC BY credit", () => {
    const html = render({
      sales: [
        {
          title: "2018 Honda Accord",
          price: 4200,
          priceLabel: "Last observed bid at close",
          attribution: CC,
          sourceUrl: "https://gsaauctions.gov/x",
        },
      ],
      credits: [CC],
    });
    expect(html).toContain("not retail prices");
    expect(html).toContain("Last observed bid at close");
    expect(html).toContain("$4,200");
    expect(html).toContain("CC BY 4.0");
  });

  it("credits come from the rows even if the credits list is missing", () => {
    expect(
      render({ sales: [{ title: "x", price: 1, attribution: CC }] }),
    ).toContain("CC BY 4.0");
  });

  it("renders nothing for rows without attribution", () => {
    expect(
      render({ sales: [{ title: "x", price: 1, attribution: null }] }),
    ).toBe("");
  });
});

describe("GovLane href scheme check (client side)", () => {
  it("drops javascript:, data:, protocol-relative and malformed links", async () => {
    const { safeHttpUrl } = await import("@/components/deal/RecentlySold");
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,x",
      "//evil.example/x",
      "not a url",
      "",
      null,
    ])
      expect(safeHttpUrl(bad), String(bad)).toBeUndefined();
    expect(safeHttpUrl("https://gsaauctions.gov/x")).toBe(
      "https://gsaauctions.gov/x",
    );
    const html = render({
      sales: [
        {
          title: "x",
          price: 1,
          attribution: CC,
          sourceUrl: "javascript:alert(1)",
        },
      ],
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("href=");
  });
});
