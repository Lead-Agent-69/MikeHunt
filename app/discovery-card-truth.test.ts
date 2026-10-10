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
