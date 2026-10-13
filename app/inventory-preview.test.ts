import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwipeVehicleFace } from "@/components/search/SwipeVehicleFace";
import { FeedVehicleCard } from "@/components/feed/FeedVehicleCard";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";

describe("photo-first inventory previews", () => {
  it("discloses missing body-style coverage and clears only the style filter", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryViewLinks, {
        query: "states=MO%2CTX&body=Pickup&includeRepairable=0&q=Ford",
        current: "/feed",
      }),
    );
    expect(html).toContain("Body style is not reported for every listing.");
    expect(html).toContain('name="body" value=""');
    expect(html).toContain('name="states" value="MO,TX"');
    expect(html).toContain('name="includeRepairable" value="0"');
    expect(html).toContain('name="q" value="Ford"');
  });
  it("does not silently discard swipe photos after the eighth image", () => {
    const html = renderToStaticMarkup(
      createElement(SwipeVehicleFace, {
        deal: {
          id: "gallery",
          title: "Ford",
          images: Array.from(
            { length: 12 },
            (_, i) => `https://example.com/${i}.jpg`,
          ),
        },
      }),
    );
    expect(html).toContain("1/12 photos");
    expect(html).not.toContain("1/8 photos");
    expect(html).toContain("Next photo");
  });
  it("shows source last-seen dates without calling them verified availability", () => {
    const item = {
      id: "seen",
      title: "Ford",
      source: "craigslist",
      lastSeenAt: "2026-10-12T23:00:00Z",
    };
    const html = renderToStaticMarkup(createElement(FeedVehicleCard, { item }));
    expect(html.toLowerCase()).toContain('datetime="2026-10-12t23:00:00z"');
    expect(html).toContain("Oct 12, 2026");
    expect(html).not.toContain("Verified available");
    const unknown = renderToStaticMarkup(
      createElement(FeedVehicleCard, {
        item: { ...item, lastSeenAt: "invalid" },
      }),
    );
    expect(unknown).toContain("Last seen date not reported");
    expect(unknown).not.toContain("Invalid Date");
  });
  it("keeps pending view links and body-style controls unavailable until scope is ready", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryViewLinks, {
        query: "states=MO",
        current: "/feed",
        disabled: true,
      }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<select");
    const ready = renderToStaticMarkup(
      createElement(InventoryViewLinks, {
        query: "states=MO",
        current: "/feed",
      }),
    );
    expect(ready).not.toContain('aria-busy="true"');
    expect(ready).toContain("states=MO");
  });
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
