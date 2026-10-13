import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwipeVehicleFace } from "@/components/search/SwipeVehicleFace";
import { FeedVehicleCard } from "@/components/feed/FeedVehicleCard";

describe("photo-first inventory previews", () => {
  it("swipe shows photo paging and payment meaning without a made-up buy recommendation", () => {
    const html = renderToStaticMarkup(
      createElement(SwipeVehicleFace, {
        deal: {
          id: "one",
          title: "Ford Edge",
          source: "craigslist_dealer",
          askPrice: 2600,
          priceEvidence: { kind: "down_payment", listedAmount: 2600 },
          images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
          locationCity: "Springfield,mo",
          locationState: "MO",
        },
      }),
    );
    expect(html).toContain("Possible down payment");
    expect(html).toContain("Next photo");
    expect(html).toContain("Previous photo");
    expect(html).toContain("Quick review");
    expect(html).toContain("Springfield, MO");
    expect(html).not.toContain("BUY");
    expect(html).not.toContain("Max bid");
  });
  it("feed shows one amount with its meaning, review and full analysis", () => {
    const html = renderToStaticMarkup(
      createElement(FeedVehicleCard, {
        item: {
          id: "one",
          title: "Ford Edge",
          source: "craigslist_dealer",
          askPrice: 2600,
          priceLabel: "Possible down payment",
          locationCity: "Springfield,mo",
          locationState: "MO",
        },
      }),
    );
    expect(html).toContain("Possible down payment");
    expect(html.match(/\$2,600/g)).toHaveLength(1);
    expect(html).toContain("Quick review");
    expect(html).toContain("Full analysis");
    expect(html).toContain("Springfield, MO");
    expect(html).not.toContain("BUY");
    expect(html).not.toContain("profit");
  });
});
