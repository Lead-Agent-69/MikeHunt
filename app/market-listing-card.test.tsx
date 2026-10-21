import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import type { MarketListing } from "@/lib/market/explorer";
import { toLocalSavedVehicle } from "@/hooks/useLocalSavedVehicles";
import { savedPricePresentation } from "@/lib/saved/price-presentation";
import type { DiscoveryDeal } from "@/components/discovery/types";

const controls = vi.hoisted(() => ({
  toggle: vi.fn(async () => {}),
  save: vi.fn(),
}));
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: (deal: unknown) => {
    controls.save(deal);
    return {
      saved: false,
      busy: false,
      label: "Save to account",
      toggle: controls.toggle,
    };
  },
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
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  controls.toggle.mockClear();
  controls.save.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

it.each([
  [0, "At supported estimate", "$0"],
  [-1500, "Above supported estimate", "$1,500"],
  [2500, "Below supported estimate", "$2,500"],
] as const)(
  "labels a %s price gap direction plainly, never as profit",
  async (gap, label, amount) => {
    await act(async () =>
      root.render(
        <MarketListingCard
          row={{ ...listing([]), priceGap: gap }}
          flipDesk={false}
        />,
      ),
    );
    expect(host.textContent).toContain(label);
    expect(
      host.querySelector('[data-testid="market-price-gap"]')?.textContent,
    ).toContain(amount);
    expect(host.textContent).toContain(
      "Before repair costs, fees and transport",
    );
  },
);

it.each([
  ["asking", "Asking price"],
  ["current_bid", "Current bid"],
  ["buy_now", "Buy-now price"],
  ["down_payment", "Possible down payment"],
  ["monthly_payment", "Monthly payment"],
  ["finance_teaser", "Payment amount"],
  ["reference", "Reference value"],
  ["unknown", "Unverified advertised amount"],
] as const)(
  "preserves %s from Market through the device snapshot",
  async (kind, label) => {
    const row = listing([]);
    row.price = { ...row.price, kind, amount: 2180 };
    await act(async () =>
      root.render(<MarketListingCard row={row} flipDesk={false} />),
    );
    const deal = controls.save.mock.lastCall![0] as DiscoveryDeal;
    const snapshot = toLocalSavedVehicle(deal);
    expect(
      savedPricePresentation(snapshot.askPrice, snapshot.priceEvidence),
    ).toEqual({
      label,
      amount: "$2,180",
    });
  },
);
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("shows an ended auction as a last observed bid", async () => {
  const row = { ...listing([]), auctionEndAt: "2020-01-01T12:00:00Z" };
  await act(async () =>
    root.render(<MarketListingCard row={row} flipDesk={false} />),
  );
  expect(host.textContent).toContain("Last observed bid; auction has ended.");
  expect(host.textContent).not.toContain("Bidding is open");
});

it("uses photo halves to browse while retaining the separate detail and save actions", async () => {
  const row = listing([
    "https://images.test/front.jpg",
    "https://images.test/rear.jpg",
  ]);
  await act(async () =>
    root.render(<MarketListingCard row={row} flipDesk={false} />),
  );
  const link = host.querySelector<HTMLAnchorElement>(
    'a[aria-label^="Open details for"]',
  )!;
  vi.spyOn(link, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 400, 300),
  );
  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail: 1,
    clientX: 350,
  });
  await act(async () => link.dispatchEvent(click));
  expect(click.defaultPrevented).toBe(true);
  expect(host.querySelector("img")!.src).toBe(row.images![1]);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label^="Previous photo"]')!
      .click(),
  );
  expect(host.querySelector("img")!.src).toBe(row.images![0]);
  expect(host.querySelector(`h3 a[href="/deal/${row.id}"]`)).not.toBeNull();
  expect(controls.toggle).not.toHaveBeenCalled();
});

it("keeps one price and identity below the unobstructed photo, with separate detail and save actions", async () => {
  const row = listing(["https://images.test/vehicle.jpg"]);
  await act(async () =>
    root.render(<MarketListingCard row={row} flipDesk={false} />),
  );
  const photo = host.querySelector('[data-testid="market-card-photo"]')!;
  const price = host.querySelector('[data-testid="market-card-price"]')!;
  expect(photo.textContent).not.toContain("2020 Ford Mustang");
  expect(photo.textContent).not.toContain("Current bid");
  expect(photo.textContent).not.toContain("$1,000");
  expect(photo.querySelector("img")?.className).toContain("object-contain");
  expect(price.textContent).toContain("Current bid");
  expect(price.textContent).toContain("$1,000");
  expect(host.textContent?.match(/\$1,000/g)).toHaveLength(1);
  expect(
    host.querySelector('[data-testid="market-card-title"]')?.textContent,
  ).toBe(row.title);
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
    host.querySelector('[data-testid="market-card-title"]')?.textContent,
  ).toBe("2020 Ford Mustang");
  expect(host.querySelector('a[target="_blank"]')).not.toBeNull();
});

it("keeps the inspected photo stable when its inline thumbnail fails and closes a replaced gallery", () => {
  const row = listing([
    "https://images.test/a.jpg",
    "https://images.test/b.jpg",
  ]);
  act(() => root.render(<MarketListingCard row={row} flipDesk={false} />));
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label^="Enlarge photos"]')!
      .click(),
  );
  act(() =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Next image"]')!
      .click(),
  );
  act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(
    document.querySelector('[role="dialog"] img')?.getAttribute("src"),
  ).toBe(row.images![1]);
  act(() =>
    document
      .querySelector('[role="dialog"] img')!
      .dispatchEvent(new Event("load")),
  );
  expect(host.querySelector("img")?.src).toBe(row.images![1]);
  act(() =>
    root.render(
      <MarketListingCard
        row={{ ...row, images: ["https://images.test/new.jpg"] }}
        flipDesk={false}
      />,
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  act(() => root.render(<MarketListingCard row={row} flipDesk={false} />));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
