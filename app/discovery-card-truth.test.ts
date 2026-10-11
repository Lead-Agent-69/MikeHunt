import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import type { DiscoveryDeal } from "@/components/discovery/types";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({ children, className }: any) =>
      React.createElement("div", { className }, children),
  },
}));
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: () => ({
    saved: false,
    busy: false,
    label: "Save vehicle",
    toggle: vi.fn(),
  }),
}));

const listing: DiscoveryDeal = {
  id: "listing",
  title: "2018 Ford Transit",
  source: "independent_dealer",
  sellerType: "auction",
  lane: "private",
  laneColor: "#3b82f6",
  condition: "clean_title",
  askPrice: 5900,
  images: [],
  listingCount: 1,
  grade: "unknown",
  discountPct: 0,
  gradeLabel: "No market data",
  alsoOn: [],
};

it("renders conflicting sale terms honestly and keeps title separate from operability", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, { deal: listing }),
  );
  expect(html).toContain("Sale terms unclear");
  expect(html).toContain("Listed amount");
  expect(html).toContain('title="Dealer channel"');
  expect(html).not.toContain("Private channel");
  expect(html).not.toContain("Auction watch");
  expect(html).toContain("Running status not reported");
  expect(html).toContain("Clean title");
});

it("retains current-bid wording and auction warnings for actual auction inventory", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: {
        ...listing,
        source: "copart",
        lane: "auction",
        condition: "hail",
      },
    }),
  );
  expect(html).toContain("Current bid");
  expect(html).toContain("Repairable auction watch");
  expect(html).toContain("Hail reported");
  expect(html).not.toContain("Runs &amp; drives");
});

it("makes the photo, title and primary action link to the same vehicle", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, { deal: listing }),
  );
  expect(html.match(/href="\/deal\/listing"/g)).toHaveLength(3);
  expect(html).toContain('aria-label="View 2018 Ford Transit"');
  expect(html).toContain("after:pointer-events-none");
  expect(html).toContain("focus-visible:after:ring-4");
  expect(html).toMatch(/<\/a>[\s\S]*<button type="button"/);
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(container.querySelector("a button")).toBeNull();
  expect(container.querySelector("button")?.closest("a")).toBeNull();
});

it("keeps live-preview photo navigation external with safe tab attributes", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: {
        ...listing,
        id: "live-listing",
        sourceUrl: "https://example.com/car",
      },
    }),
  );
  expect(html.match(/href="https:\/\/example.com\/car"/g)).toHaveLength(3);
  expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3);
  expect(html).toContain("opens in a new tab");
});
