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
    window.history.replaceState(null, "", "/market?zip=78701&sources=copart");
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
          '[aria-label="Remove ZIP code filter"]',
        )!
        .click(),
    );
    expect(window.location.search).not.toContain("zip=");
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
      state.keys.filter(Boolean).some((key) => key!.includes("mode=curated")),
    ).toBe(true);
  });
});
