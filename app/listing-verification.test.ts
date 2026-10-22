import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListingVerification } from "../components/deal/ListingVerification";

describe("ListingVerification", () => {
  const base = {
    present: ["photo", "damage"] as const,
    missing: ["vin", "sellerContact"] as const,
  };
  const render = (
    props: Partial<React.ComponentProps<typeof ListingVerification>> = {},
  ) =>
    renderToStaticMarkup(
      React.createElement(ListingVerification, {
        present: [...base.present],
        missing: [...base.missing],
        onOpenSection: vi.fn(),
        ...props,
      }),
    );
  it("makes the next checks actionable without treating source fields as inspected proof", () => {
    const html = render();
    expect(html).toContain("Next check:");
    expect(html).toContain("Check title and condition");
    expect(html).toContain("Compare market evidence");
    expect(html).toContain("Contact seller and keep notes");
    expect(html).not.toContain("Plan costs and contact");
    expect(html).toContain("not a mechanic inspection");
    expect(html).toContain("does not establish its severity or repair cost");
    expect(html).toContain("Missing or unusable:");
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("Why this verdict?");
    expect(html).not.toContain("What would make this a buy?");
    expect(html).not.toContain("auction date");
  });
  it("preserves per-vehicle reasons once and does not invent an incomplete status for a candidate", () => {
    const html = render({
      present: ["vin"],
      missing: [],
      evidence: {
        state: "verified",
        label: "Buy candidate",
        summary: "Recorded evidence meets the research threshold.",
        nextCheck: "Review the final transaction terms.",
        acquisitionReady: true,
      },
    });
    expect(
      html.match(/Recorded evidence meets the research threshold/g),
    ).toHaveLength(1);
    expect(html.match(/Review the final transaction terms/g)).toHaveLength(1);
    expect(html).toContain("Buy candidate");
    expect(html).not.toContain("Evidence incomplete");
    expect(html).not.toContain("Missing or unusable:");
  });
  it.each(["down_payment", "monthly_payment", "finance_teaser"] as const)(
    "requires a full cash price for %s",
    (priceKind) => {
      const html = render({ priceKind });
      expect(html).toContain(
        "A payment or down payment cannot establish the purchase cost",
      );
      expect(html).not.toContain("final bid");
    },
  );
  it("keeps auction instructions and relevant fields separate from asking-price checks", () => {
    const html = render({
      priceKind: "current_bid",
      sourceUrl: "https://copart.com/lot/123",
      missing: ["auction"],
      dealerMode: true,
    });
    expect(html).toContain("A current bid is not the final purchase price");
    expect(html).toContain("View auction");
    expect(html).toContain("auction date");
    expect(html).toContain("Plan costs and contact");
    expect(html).toContain("Scenario assumptions do not verify a purchase");
  });
  it("does not turn missing or unsafe source URLs into active links", () => {
    for (const sourceUrl of [null, "javascript:alert(1)", "not a link"]) {
      const html = render({ sourceUrl });
      expect(html).toContain("Listing link unavailable");
      expect(html).not.toContain("href=");
    }
  });
  it("keeps listing age separate from its latest observation without asserting availability", () => {
    const html = render({
      observationLabel: "First seen 7d ago · checked just now",
    });
    expect(html).toContain("First seen 7d ago · checked just now");
    expect(html).toContain("Confirm availability");
  });
  it("retains auction terms when a price anomaly takes priority over the auction-watch state", () => {
    const html = render({
      source: "copart",
      sourceUrl: "https://copart.com/lot/123",
      priceKind: "reference",
      evidence: {
        state: "price_anomaly",
        label: "Price needs verification",
        summary: "Price terms need review.",
        nextCheck: "Confirm the real price.",
        acquisitionReady: false,
      },
    });
    expect(html).toContain("View auction");
    expect(html).toContain("buyer fees");
    expect(html).toContain("Price needs verification");
  });
});
