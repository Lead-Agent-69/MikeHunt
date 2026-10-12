import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehicleSummary } from "@/components/deal/VehicleSummary";
import { discoveryEvidence } from "@/components/discovery/card-evidence";

describe("payment disclosure presentation", () => {
  it("labels an eBay bid as an auction bid rather than an asking price", () => {
    const html = renderToStaticMarkup(
      React.createElement(VehicleSummary, {
        deal: {
          source: "ebay_motors",
          askPrice: 3000,
          priceEvidence: { kind: "current_bid", currentBid: 3000 },
        },
      }),
    );
    expect(html).toContain("Current bid");
    expect(html).not.toContain("Asking price");
    expect(
      discoveryEvidence({
        source: "ebay_motors",
        lane: "auction",
        askPrice: 3000,
        priceEvidence: { kind: "current_bid", currentBid: 3000 },
      } as any).state,
    ).toBe("auction_watch");
  });
  it("labels an advertised deposit without calling it an asking price", () => {
    const html = renderToStaticMarkup(
      React.createElement(VehicleSummary, {
        deal: {
          year: 2018,
          make: "Ford",
          model: "Edge",
          source: "craigslist_dealer",
          askPrice: 0,
          priceEvidence: { kind: "down_payment", listedAmount: 2600 },
        },
      }),
    );
    expect(html).toContain("Possible down payment");
    expect(html).toContain("$2,600");
    expect(html).toContain("Full cash price unconfirmed");
    expect(html).not.toContain("Asking price");
  });
  it("does not hide an ordinary source-reported asking price", () => {
    const html = renderToStaticMarkup(
      React.createElement(VehicleSummary, {
        deal: { source: "cars_com", askPrice: 15995 },
      }),
    );
    expect(html).toContain("$15,995");
    expect(html).not.toContain("Full cash price unconfirmed");
  });
  it("gives the buyer a specific next check, not a bargain verdict", () => {
    const evidence = discoveryEvidence({
      source: "craigslist_dealer",
      askPrice: 0,
      priceEvidence: { kind: "down_payment", listedAmount: 2600 },
    } as any);
    expect(evidence.label).toBe("Full price unconfirmed");
    expect(evidence.acquisitionReady).toBe(false);
    expect(evidence.nextCheck).toContain("full cash price");
  });
});
