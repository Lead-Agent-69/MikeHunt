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
  expect(html).not.toContain("Running status not reported");
  expect(html).toContain("Title unconfirmed");
});

it("keeps ordinary dealer cards concise without asserting verified operability", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: { ...listing, sellerType: "dealer", lane: "clean-retail" },
    }),
  );
  expect(html).not.toContain("Running status not reported");
  expect(html).not.toContain("Operability unconfirmed");
  expect(html).not.toContain("Runs &amp; drives");
  expect(html).toContain("Title unconfirmed");
});

it.each(["salvage_title", "rebuilt_title"])(
  "keeps %s dealer title warnings without manufacturing a running-status warning",
  (condition) => {
    const html = renderToStaticMarkup(
      React.createElement(DiscoveryCard, {
        deal: {
          ...listing,
          source: "salvagezone",
          sellerType: "dealer",
          lane: "salvage",
          condition,
        },
      }),
    );
    expect(html).toContain(
      condition === "salvage_title"
        ? "Reported salvage title"
        : "Reported rebuilt title",
    );
    expect(html).not.toContain("Running status not reported");
    expect(html).not.toContain("Runs &amp; drives");
  },
);

it("keeps unknown running status relevant on actual auction title-only records", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: {
        ...listing,
        source: "copart",
        sellerType: "auction",
        lane: "auction",
      },
    }),
  );
  expect(html).toContain("Running status not reported");
  expect(html).toContain("Title unconfirmed");
});

it("retains listing-reported clean titles without asserting verified operability", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: { ...listing, titleSource: "listing", sellerType: "dealer" },
    }),
  );
  expect(html).toContain("Reported clean title");
  expect(html).not.toContain("Title unconfirmed");
  expect(html).not.toContain("Runs &amp; drives");
});

it.each([
  [undefined, "Last observed bid"],
  ["invalid", "Last observed bid"],
  ["2020-01-01T00:00:00Z", "Last observed bid"],
  ["2099-01-01T00:00:00Z", "Current bid"],
])(
  "qualifies auction timing %s while retaining the reported bid",
  (auctionEndAt, label) => {
    const html = renderToStaticMarkup(
      React.createElement(DiscoveryCard, {
        deal: {
          ...listing,
          source: "copart",
          lane: "auction",
          condition: "hail",
          askPrice: 0,
          priceEvidence: { kind: "current_bid", currentBid: 5900 },
          auctionEndAt,
        },
      }),
    );
    expect(html).toContain(label);
    expect(html).toContain("$5,900");
    expect(html).toContain("Repairable auction watch");
    expect(html).toContain("Hail reported");
    expect(html).not.toContain("Runs &amp; drives");
  },
);

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
  const host = document.createElement("div");
  host.innerHTML = html;
  const links = Array.from(
    host.querySelectorAll('a[href="https://example.com/car"]'),
  );
  expect(links).toHaveLength(4);
  expect(
    links.every((link) => link.getAttribute("rel") === "noopener noreferrer"),
  ).toBe(true);
  expect(
    host.querySelector(
      'a[aria-label="View listing at example.com (opens in a new tab)"]',
    ),
  ).not.toBeNull();
  expect(host.querySelector("a a")).toBeNull();
  expect(html).toContain("opens in a new tab");
});

it("extends the real vehicle link across the card without covering independent controls", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    React.createElement(DiscoveryCard, { deal: listing }),
  );
  const link = container.querySelector('[data-testid="discovery-card-open"]');
  expect(link?.getAttribute("href")).toBe("/deal/listing");
  expect(link?.className).toContain("after:inset-0");
  expect(link?.className).toContain("after:z-10");
  expect(container.querySelector(".deal-card")?.className).toContain("isolate");
  expect(container.querySelector("button")?.className).toContain("z-20");
  for (const details of Array.from(container.querySelectorAll("details"))) {
    expect(details.className).toContain("relative z-20");
    expect(details.closest("a")).toBeNull();
  }
});

it("gives the original vendor a separate accessible link above the card overlay", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: {
        ...listing,
        source: "independent_dealer",
        sourceUrl: "https://stlouis.craigslist.org/ctd/d/vehicle/123.html",
      },
    }),
  );
  const vendor = host.querySelector(
    'a[aria-label="View listing at Craigslist (opens in a new tab)"]',
  );
  expect(vendor?.getAttribute("href")).toContain("craigslist.org/ctd/");
  expect(vendor?.className).toContain("z-20");
  expect(vendor?.className).toContain("min-h-11");
  expect(vendor?.parentElement?.closest("a")).toBeNull();
  expect(vendor?.closest("details")).toBeNull();
  expect(host.querySelector("a a")).toBeNull();
});

it("shows seller, missing mileage and valuation basis without opening a disclosure", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: {
        ...listing,
        seller: "Local Auto",
        sellEstimate: 9000,
        compCount: 4,
      },
    }),
  );
  expect(
    container.querySelector('[data-testid="discovery-card-seller"]')
      ?.textContent,
  ).toContain("Local Auto");
  const market = container.querySelector(
    '[data-testid="discovery-card-market"]',
  );
  expect(market?.textContent).toContain("Listing estimate");
  expect(market?.textContent).toContain("$9,000");
  expect(market?.closest("details")).toBeNull();
  expect(container.textContent).toContain("Mileage not reported");
  expect(container.textContent).toContain("Location not reported");
});

it("keeps price, evidence and site count below the full vehicle photo", () => {
  const html = renderToStaticMarkup(
    React.createElement(DiscoveryCard, {
      deal: {
        ...listing,
        images: ["https://images.test/car.jpg"],
        listingCount: 2,
      },
    }),
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  const photo = host.querySelector('[data-testid="discovery-card-photo"]')!;
  expect(photo.textContent).not.toContain("$5,900");
  expect(photo.textContent).not.toContain(listing.title);
  expect(photo.textContent).not.toContain("Sale terms unclear");
  expect(photo.textContent).not.toContain("2 sites");
  expect(photo.querySelector("img")?.className).toContain("object-contain");
  expect(
    host.querySelector('[data-testid="discovery-card-price"]')?.textContent,
  ).toContain("$5,900");
  expect(host.textContent).toContain("Sale terms unclear");
  expect(host.textContent).toContain("2 sites");
});
