import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: () => ({
    saved: false,
    busy: false,
    label: "Save to account",
    toggle: vi.fn(),
  }),
}));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwipeVehicleFace } from "@/components/search/SwipeVehicleFace";
import { FeedVehicleCard } from "@/components/feed/FeedVehicleCard";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";

describe("photo-first inventory previews", () => {
  it.each([
    ["", false],
    ["seenWithin=30", true],
    ["body=Pickup", true],
  ])(
    "keeps default browsing compact and exposes selected advanced options (%s)",
    (query, expanded) => {
      const html = renderToStaticMarkup(
        createElement(InventoryViewLinks, {
          query: String(query),
          current: "/feed",
        }),
      );
      const host = document.createElement("div");
      host.innerHTML = html;
      expect(host.querySelector("details")!.hasAttribute("open")).toBe(
        expanded,
      );
      expect(
        host.querySelector('summary[aria-label^="Browse options"]'),
      ).not.toBeNull();
    },
  );
  it("keeps the complete search when Feed users open the full filters", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryViewLinks, {
        query:
          "states=MO%2CIL&zip=63101&radius=100&maxMileage=50000&q=Ford&scope=explicit",
        current: "/feed",
      }),
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const link = Array.from(host.querySelectorAll("a")).find((link) =>
      link.textContent?.includes("Search & filters"),
    )!;
    const url = new URL(link.href);
    expect(url.pathname).toBe("/market");
    for (const [key, value] of Object.entries({
      states: "MO,IL",
      zip: "63101",
      radius: "100",
      maxMileage: "50000",
      q: "Ford",
      filters: "open",
    }))
      expect(url.searchParams.get(key)).toBe(value);
  });
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
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(
      host.querySelector('[data-testid="swipe-vehicle-photo"]')?.textContent,
    ).not.toContain("photos");
    expect(html).toContain("1/12 photos");
    expect(html).not.toContain("1/8 photos");
    expect(html).toContain("Next photo");
    const action = host.querySelector('[aria-label="Swipe review action"]');
    expect(action?.querySelector("button")?.textContent).toContain(
      "Quick review",
    );
    expect(action?.className).not.toContain("overflow-y-auto");
  });
  it("shows source last-seen dates without calling them verified availability", () => {
    const item = {
      id: "seen",
      title: "Ford",
      source: "craigslist",
      image: "https://example.com/car.jpg",
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
  it("makes fresh, recent and archive inventory explicit across views", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryViewLinks, {
        query: "states=MO&seenWithin=7",
        current: "/feed",
      }),
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    const freshness = host.querySelector('[aria-label="Inventory freshness"]')!;
    expect(freshness.querySelectorAll("a")).toHaveLength(3);
    expect(freshness.textContent).toContain("Fresh");
    expect(freshness.textContent).toContain("Recent");
    expect(freshness.textContent).toContain("Archive");
    expect(
      freshness.querySelector('[aria-current="true"]')?.textContent,
    ).toContain("Recent");
    expect(html).toContain("never count as a current buying recommendation");
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
          image: "https://example.com/car.jpg",
          locationCity: "Springfield,mo",
          locationState: "MO",
        },
      }),
    );
    const host = document.createElement("div");
    host.innerHTML = html;
    expect(
      host.querySelector('[data-testid="feed-vehicle-photo"]')?.textContent,
    ).not.toContain("Springfield");
    expect(
      host.querySelector('[data-testid="feed-vehicle-photo"]')?.textContent,
    ).not.toContain("Craigslist");
    expect(html).toContain("Possible down payment");
    expect(html.match(/\$2,600/g)).toHaveLength(1);
    expect(html).toContain("Quick review");
    expect(html).toContain("Full analysis");
    expect(html).toContain("Springfield, MO");
    expect(html).not.toContain("BUY");
    expect(html).not.toContain("profit");
  });
});
