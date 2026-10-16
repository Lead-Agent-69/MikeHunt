import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "personal",
  pending: false,
  keys: [] as (string | null)[],
}));
vi.mock("swr", () => ({
  default: (key: string | null) => {
    state.keys.push(key);
    return {
      data: key
        ? { rows: [{ id: "car" }], total: 1105, mode: "all", facets: {} }
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
  usePreferences: () => ({ prefs: {} }),
}));
import MarketPage from "./(dashboard)/market/page";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/market");
  state.mode = "personal";
  state.pending = false;
  state.keys = [];
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
  it("commits location and radius together, crosses state scope, and clears nearest sort nationwide", async () => {
    window.history.replaceState(null, "", "/market?states=MO");
    await render();
    act(() =>
      Simulate.change(
        host.querySelector<HTMLInputElement>('[aria-label="Search location"]')!,
        { target: { value: "63101" } } as any,
      ),
    );
    act(() =>
      Simulate.change(
        host.querySelector<HTMLSelectElement>('[aria-label="Search radius"]')!,
        { target: { value: "150" } } as any,
      ),
    );
    act(() =>
      Simulate.submit(
        host.querySelector('section[aria-label="Location and radius"] form')!,
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
    act(() =>
      Simulate.change(
        host.querySelector<HTMLSelectElement>(
          '[aria-label="Sort market results"]',
        )!,
        { target: { value: "distanceMiles:asc" } } as any,
      ),
    );
    act(() =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Nationwide")!
        .click(),
    );
    expect(new URLSearchParams(window.location.search).has("near")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("sort")).toBe(
      "lastSeenAt",
    );
  });
});
