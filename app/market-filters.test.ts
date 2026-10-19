import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_SAVED_SEARCH_KEY } from "@/hooks/useLocalSavedSearches";
import type { Prefs } from "@/hooks/usePreferences";

const state = vi.hoisted(() => ({
  mode: "personal",
  pending: false,
  keys: [] as (string | null)[],
  prefs: {} as Prefs,
}));
vi.mock("swr", () => ({
  default: (key: string | null) => {
    state.keys.push(key);
    return {
      data: key
        ? {
            rows: [{ id: "car" }],
            total: 1105,
            mode: "all",
            facets: {
              sources: [
                { value: "copart", n: 640 },
                { value: "iaa", n: 310 },
              ],
            },
            sourceCoverage: {
              counts: { copart: 640 },
              complete: true,
              accessReviewIds: [],
            },
          }
        : undefined,
      isLoading: false,
      mutate: vi.fn(),
    };
  },
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: state.mode } }),
}));
vi.mock("@/components/ui/performance-optimizations", () => ({
  useDebouncedValue: (value: string) =>
    state.pending ? "stale-search" : value,
}));
vi.mock("@/components/market/USHeatmap", () => ({ USHeatmap: () => null }));
vi.mock("@/components/market/MarketVisualizers", () => ({
  MarketVisualizers: () => null,
}));
vi.mock("@/components/scan/DealTable", () => ({
  DealTable: () => React.createElement("p", null, "Inventory results"),
}));
vi.mock("@/components/shared/Ico", () => ({ Ico: () => null }));
vi.mock("@/components/shared/PriceRangeSelector", () => ({
  PriceRangeSelector: () => null,
  YearRangeSelector: () => null,
}));
vi.mock("@/components/market/MarketListingCard", () => ({
  MarketListingCard: () => React.createElement("p", null, "Inventory results"),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: state.prefs }),
}));
import MarketPage from "./(dashboard)/market/page";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  window.history.replaceState(null, "", "/market");
  state.mode = "personal";
  state.pending = false;
  state.keys = [];
  state.prefs = {};
  localStorage.clear();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () => {
    root.render(React.createElement(MarketPage));
  });

describe("Market filter journey", () => {
  it("normalizes legacy title aliases and allows clearing multiple sources from the everyday selector", async () => {
    window.history.replaceState(
      null,
      "",
      "/market?titleType=salvage_title&sources=copart,iaa",
    );
    await render();
    expect(new URLSearchParams(window.location.search).get("titleType")).toBe(
      "salvage",
    );
    const source = host.querySelector<HTMLSelectElement>(
      '[aria-label="Quick source or dealer"]',
    )!;
    expect(source.value).toBe("__selected");
    expect(source.querySelector('option[value=""]')?.textContent).toBe(
      "All sources",
    );
    act(() => Simulate.change(source, { target: { value: "" } } as any));
    expect(new URLSearchParams(window.location.search).has("sources")).toBe(
      false,
    );
  });
  it("normalizes legacy all-source and all-make links rather than requesting an invalid source", async () => {
    window.history.replaceState(
      null,
      "",
      "/market?source=all&make=all&scope=explicit",
    );
    await render();
    const params = new URLSearchParams(window.location.search);
    expect(params.has("sources")).toBe(false);
    expect(params.has("makes")).toBe(false);
  });
  it("replaces a legacy unknown-title constraint when the user chooses clean title", async () => {
    window.history.replaceState(null, "", "/market?titleType=unknown");
    await render();
    const toggle = host.querySelector<HTMLButtonElement>(
      '[aria-controls="market-filter-panel"]',
    )!;
    act(() => toggle.click());
    const clean = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Quick market filters"] button',
      ),
    ).find((button) => button.textContent === "Clean title")!;
    act(() => clean.click());
    const params = new URLSearchParams(window.location.search);
    expect(params.has("titleType")).toBe(false);
    expect(params.get("conditions")).toBe("clean_title");
  });
  it("uses saved buying limits only for a fresh search, not an explicit shared search", async () => {
    state.prefs = {
      buyerScope: {
        model: "Bronco",
        maxMileage: 50000,
        minYear: 2020,
        maxYear: 2026,
        maxPrice: 30000,
        includeRepairable: false,
      },
    };
    await render();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("model")).toBe("Bronco");
    expect(params.get("mileageMax")).toBe("50000");
    expect(params.get("yearMin")).toBe("2020");
    expect(params.get("priceMax")).toBe("30000");
    expect(params.get("includeRepairable")).toBe("0");
    act(() => {
      window.history.replaceState(
        null,
        "",
        "/market?scope=explicit&model=Civic",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const explicit = new URLSearchParams(window.location.search);
    expect(explicit.get("model")).toBe("Civic");
    expect(explicit.has("mileageMax")).toBe(false);
  });
  it("does not turn legacy zero budgets into an invalid maximum-price filter", async () => {
    state.prefs = { buyerScope: { minPrice: 0, maxPrice: 0, maxMileage: 0 } };
    await render();
    const params = new URLSearchParams(window.location.search);
    expect(params.has("priceMin")).toBe(false);
    expect(params.has("priceMax")).toBe(false);
    expect(params.get("mileageMax")).toBe("0");
  });
  it("applies the visible source selector without opening advanced controls", async () => {
    await render();
    const source = host.querySelector<HTMLSelectElement>(
      '[aria-label="Quick source or dealer"]',
    )!;
    act(() => Simulate.change(source, { target: { value: "copart" } } as any));
    expect(new URLSearchParams(window.location.search).get("sources")).toBe(
      "copart",
    );
    expect(
      source.querySelector('option[value="__browse"]')?.textContent,
    ).toContain("Browse every source in All filters");
    expect(source.querySelector('option[value="iaa"]')).toBeNull();
  });
  it("retains unknown title, repair exclusion and price-gap sort from other views", async () => {
    window.history.replaceState(
      null,
      "",
      "/market?titleType=unknown&includeRepairable=0&sort=margin&maxMileage=50000",
    );
    await render();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("titleType")).toBe("unknown");
    expect(params.get("includeRepairable")).toBe("0");
    expect(params.get("sort")).toBe("priceGap");
    expect(params.get("mileageMax")).toBe("50000");
    expect(
      host.querySelector('[aria-label="Save search on this device"]'),
    ).not.toBeNull();
  });
  it("exposes and applies everyday mileage controls before opening advanced filters", async () => {
    await render();
    const controls = host.querySelector(
      '[aria-label="Everyday search filters"]',
    )!;
    const mileage = controls.querySelector<HTMLInputElement>(
      '[aria-label="Quick mileage up to"]',
    )!;
    act(() => Simulate.change(mileage, { target: { value: "50000" } } as any));
    expect(new URLSearchParams(window.location.search).get("mileageMax")).toBe(
      "50000",
    );
    expect(
      host
        .querySelector('[aria-controls="market-filter-panel"]')!
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
  it("preserves a typed comma so users can enter multiple makes", async () => {
    await render();
    const input = host.querySelector<HTMLInputElement>('[aria-label="Makes"]')!;
    act(() => Simulate.change(input, { target: { value: "Ford," } } as any));
    expect(input.value).toBe("Ford,");
    act(() =>
      Simulate.change(input, { target: { value: "Ford,Toyota" } } as any),
    );
    const keys = state.keys.filter(Boolean);
    const params = new URL(keys[keys.length - 1]!, "https://example.test")
      .searchParams;
    expect(params.get("makes")).toBe("Ford,Toyota");
  });
  it("does not fetch or display an earlier filter scope while inputs settle", async () => {
    state.pending = true;
    await render();
    expect(state.keys.every((key) => key === null)).toBe(true);
    expect(host.textContent).toContain("Searching");
    expect(host.textContent).not.toContain("Inventory results");
    expect(host.textContent).not.toContain("No matches");
  });
  it("restores shareable filters and keeps dealer economics off a personal desk", async () => {
    window.history.replaceState(
      null,
      "",
      "/market?runDrive=unknown&sources=copart&minProfit=1000&page=2",
    );
    await render();
    const keys = state.keys.filter(Boolean);
    const params = new URL(keys[keys.length - 1]!, "https://example.test")
      .searchParams;
    expect(params.get("runDrive")).toBe("unknown");
    expect(params.get("sources")).toBe("copart");
    expect(params.get("page")).toBe("2");
    expect(params.get("mode")).toBe("all");
    expect(params.has("minProfit")).toBe(false);
    expect(host.querySelector('[aria-label="Min profit ($)"]')).toBeNull();
    expect(host.querySelectorAll("h1")).toHaveLength(1);
  });

  it("offers mobile filter disclosure, removable filters and reachable result pages", async () => {
    window.history.replaceState(
      null,
      "",
      "/market?listingZip=78701&sources=copart",
    );
    await render();
    const toggle = host.querySelector<HTMLButtonElement>(
      '[aria-controls="market-filter-panel"]',
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("Listings"))!
        .click(),
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Next results page"]')!
        .click(),
    );
    expect(window.location.search).toContain("page=1");
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Remove Listing ZIP filter"]',
        )!
        .click(),
    );
    expect(window.location.search).not.toContain("listingZip=");
    expect(window.location.search).toContain("page=0");
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Reset filters"]')!
        .click(),
    );
    expect(window.location.search).not.toContain("sources=");
  });

  it("retains resale controls for dealer desks", async () => {
    state.mode = "dealer";
    await render();
    expect(host.textContent).toContain("Curated");
    expect(
      host.querySelector('option[value="profitEstimate:desc"]'),
    ).not.toBeNull();
    expect(
      state.keys.filter(Boolean).some((key) => key!.includes("mode=all")),
    ).toBe(true);
  });
  it("offers working quick filters while keeping exact controls collapsed", async () => {
    await render();
    const filterToggle = host.querySelector<HTMLButtonElement>(
      '[aria-controls="market-filter-panel"]',
    )!;
    act(() => filterToggle.click());
    const exact = host.querySelector<HTMLDetailsElement>(
      '[data-testid="exact-market-filters"]',
    )!;
    expect(exact.open).toBe(false);

    const runDrive = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Quick market filters"] button',
      ),
    ).find((button) => button.textContent === "Run & drive")!;
    act(() => runDrive.click());
    expect(new URLSearchParams(window.location.search).get("runDrive")).toBe(
      "yes",
    );
    expect(runDrive.getAttribute("aria-pressed")).toBe("true");
    act(() => runDrive.click());
    expect(new URLSearchParams(window.location.search).has("runDrive")).toBe(
      false,
    );
  });
  it("shows source inventory counts and filters directly from results", async () => {
    await render();
    const sourceStrip = host.querySelector(
      '[aria-label="Browse results by source"]',
    )!;
    expect(sourceStrip.textContent).toContain("Copart · 640");
    const copart = Array.from(
      sourceStrip.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Copart"))!;
    act(() => copart.click());
    expect(new URLSearchParams(window.location.search).get("sources")).toBe(
      "copart",
    );
  });
  it("saves the exact Market Explorer query for reopening", async () => {
    window.history.replaceState(
      null,
      "",
      "/market?makes=Ford&priceMin=10000&page=2",
    );
    await render();
    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("Save search"))!
        .click(),
    );
    const saved = JSON.parse(
      localStorage.getItem(LOCAL_SAVED_SEARCH_KEY) || "[]",
    );
    expect(saved).toHaveLength(1);
    const params = new URLSearchParams(saved[0].market_params);
    expect(params.get("makes")).toBe("Ford");
    expect(params.get("priceMin")).toBe("10000");
    expect(params.has("page")).toBe(false);
  });
  it("commits location and radius together, crosses state scope, and clears nearest sort nationwide", async () => {
    window.history.replaceState(null, "", "/market?states=MO");
    await render();
    act(() =>
      Simulate.change(
        host.querySelector<HTMLInputElement>(
          '[aria-label="ZIP or city, state"]',
        )!,
        { target: { value: "63101" } } as any,
      ),
    );
    act(() =>
      Simulate.change(
        host.querySelector<HTMLSelectElement>(
          '[aria-label="Distance from location"]',
        )!,
        { target: { value: "150" } } as any,
      ),
    );
    act(() =>
      Simulate.submit(
        host.querySelector('section[aria-label="Search area"] form')!,
      ),
    );
    expect(new URLSearchParams(window.location.search).get("near")).toBe(
      "63101",
    );
    expect(new URLSearchParams(window.location.search).get("radius")).toBe(
      "150",
    );
    expect(new URLSearchParams(window.location.search).has("states")).toBe(
      false,
    );
    expect(host.textContent).toContain("Within 150 mi of 63101");
    expect(host.textContent).not.toContain("150 mi radius");
    act(() =>
      Simulate.change(
        host.querySelector<HTMLSelectElement>(
          '[aria-label="Sort market results"]',
        )!,
        { target: { value: "distanceMiles:asc" } } as any,
      ),
    );
    act(() =>
      Simulate.change(
        host.querySelector<HTMLSelectElement>(
          '[aria-label="Search area shortcut"]',
        )!,
        { target: { value: "nationwide" } } as any,
      ),
    );
    expect(new URLSearchParams(window.location.search).has("near")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("sort")).toBe(
      "lastSeenAt",
    );
  });

  it("keeps listings, filters, and intelligence in separate focused workspaces", async () => {
    await render();
    const workspace = host.querySelector('nav[aria-label="Market workspace"]')!;
    const results = host.querySelector('[aria-label="Market results"]')!;
    expect(
      workspace.compareDocumentPosition(results) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      host.querySelector('[data-testid="market-intelligence-dashboard"]'),
    ).toBeNull();
    expect(host.querySelector('nav[aria-label="Market tools"]')).toBeNull();

    const buttons = Array.from(workspace.querySelectorAll("button"));
    const insights = buttons.find(
      (button) => button.getAttribute("aria-label") === "Market insights",
    )!;
    act(() => Simulate.click(insights));
    expect(host.querySelector('[aria-label="Market results"]')).toBeNull();
    expect(
      host.querySelector('[data-testid="market-intelligence-dashboard"]'),
    ).not.toBeNull();

    const listings = buttons.find((button) =>
      button.textContent?.includes("Listings"),
    )!;
    act(() => Simulate.click(listings));
    expect(host.querySelector('[aria-label="Market results"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="market-intelligence-dashboard"]'),
    ).toBeNull();
  });
});
