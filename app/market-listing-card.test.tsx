import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import type { MarketListing } from "@/lib/market/explorer";

const controls = vi.hoisted(() => ({ toggle: vi.fn(async () => {}) }));
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: () => ({
    saved: false,
    busy: false,
    label: "Save to account",
    toggle: controls.toggle,
  }),
}));
vi.mock("@/lib/image-url", () => ({ proxiedImage: (url: string) => url }));
import { MarketListingCard } from "@/components/market/MarketListingCard";

let root: Root, host: HTMLDivElement;
const listing = (images: string[]): MarketListing => ({
  id: "10000000-0000-4000-8000-000000000001",
  title: "2020 Ford Mustang",
  year: 2020,
  make: "Ford",
  model: "Mustang",
  source: "copart",
  sourceUrl: "https://www.copart.com/lot/12345678",
  askPrice: 1000,
  price: sourcePriceContext({ source: "copart", ask_price: 1000 }),
  images,
  lane: "auction",
  profitEstimate: 0,
  profitScore: 0,
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  controls.toggle.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("keeps vehicle identity and bid meaning in the photo preview, with separate detail and save actions", async () => {
  const row = listing(["https://images.test/vehicle.jpg"]);
  await act(async () =>
    root.render(<MarketListingCard row={row} flipDesk={false} />),
  );
  const preview = host.querySelector('[data-testid="market-price-preview"]')!;
  expect(preview.textContent).toContain("2020 Ford Mustang");
  expect(preview.textContent).toContain("Current bid");
  expect(preview.textContent).toContain("$1,000");
  expect(
    host
      .querySelector('a[aria-label^="Open details for"]')
      ?.getAttribute("href"),
  ).toBe(`/deal/${row.id}`);
  const save = host.querySelector<HTMLButtonElement>(
    'button[aria-label^="Save to account:"]',
  )!;
  expect(save.closest("a")).toBeNull();
  await act(async () => save.click());
  expect(controls.toggle).toHaveBeenCalledTimes(1);
  expect(
    host.querySelector('button[aria-label^="Enlarge photos"]'),
  ).not.toBeNull();
});

it("keeps a photo-less card navigable without inventing a replacement photo", async () => {
  const row = listing([]);
  await act(async () =>
    root.render(<MarketListingCard row={row} flipDesk={false} />),
  );
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain("Source photo unavailable");
  expect(
    host
      .querySelector('a[aria-label^="Open details for"]')
      ?.getAttribute("href"),
  ).toBe(`/deal/${row.id}`);
  expect(host.querySelector('button[aria-label^="Enlarge photos"]')).toBeNull();
  expect(host.querySelector('a[target="_blank"]')?.getAttribute("href")).toBe(
    row.sourceUrl,
  );
});

it("falls back safely when every supplied photo fails, retaining identity and source access", async () => {
  await act(async () =>
    root.render(
      <MarketListingCard
        row={listing(["https://images.test/missing.jpg"])}
        flipDesk={false}
      />,
    ),
  );
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain("Source photo unavailable");
  expect(
    host.querySelector('[data-testid="market-identity-preview"]')?.textContent,
  ).toBe("2020 Ford Mustang");
  expect(host.querySelector('a[target="_blank"]')).not.toBeNull();
});
