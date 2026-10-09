import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingVerification } from "../components/deal/ListingVerification";

describe("ListingVerification", () => {
  it("discloses evidence without treating listing fields as condition confidence", () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingVerification, {
        present: ["photo", "damage"],
        missing: ["vin", "sellerContact"],
        acquisitionReady: false,
      }),
    );
    expect(html).toContain("Why this verdict?");
    expect(html).toContain("What would make this a buy?");
    expect(html).toContain("What still needs checking?");
    expect(html).toContain("not inspection findings");
    expect(html).toContain("does not establish its severity or repair cost");
    expect(html).toContain("Not provided:");
    expect(html).not.toContain("confidence");
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("active rows");
  });
  it("preserves per-vehicle reasons and unresolved checks", () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingVerification, {
        present: ["vin"],
        missing: [],
        acquisitionReady: true,
        summary: "Condition and costs require confirmation.",
        nextCheck: "Obtain an independent inspection.",
      }),
    );
    expect(html).toContain("Condition and costs require confirmation.");
    expect(html).toContain("Obtain an independent inspection.");
    expect(html).not.toContain("Not provided:");
    expect(html).toContain("comparable prices");
  });
});
