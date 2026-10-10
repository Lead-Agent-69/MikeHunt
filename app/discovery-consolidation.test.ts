import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountMenuForMode } from "@/components/layout/nav-items";

const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as any,
  loading: false,
  mutate: vi.fn(),
  key: "",
  redirect: vi.fn(),
}));
vi.mock("swr", () => ({
  default: (key: string) => {
    state.key = key;
    return {
      data: state.data,
      error: state.error,
      isLoading: state.loading,
      mutate: state.mutate,
    };
  },
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {} }),
}));
vi.mock("@/components/discovery/DiscoveryCard", () => ({
  DiscoveryCard: ({ deal }: { deal: { title: string } }) =>
    React.createElement("figure", null, deal.title),
}));
import TodayPage from "./(dashboard)/today/page";
import { FlashRail } from "@/components/discovery/FlashRail";
import { SearchSourceNotice } from "@/components/search/SearchSourceNotice";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
import { CoverageNotice } from "@/components/discovery/CoverageNotice";
import { unavailableCoverage } from "@/lib/discovery/coverage";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.data = undefined;
  state.error = undefined;
  state.loading = false;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("discovery has one front door and contextual collections", () => {
  it("removes duplicate daily/flash entries from every buyer catalog", () => {
    for (const mode of ["personal", "diy", "parts", "reseller", "dealer"]) {
      const hrefs = accountMenuForMode(mode).tools.map((item) => item.href);
      expect(hrefs).not.toContain("/today");
      expect(hrefs).not.toContain("/flash-deals");
    }
  });
  it("keeps location and buyer intent when an old Today bookmark redirects", async () => {
    await TodayPage({
      searchParams: Promise.resolve({
        state: "FL",
        makes: ["Ford", "Toyota"],
        maxPrice: "10000",
      }),
    });
    const href = state.redirect.mock.calls[0][0];
    expect(href).toMatch(/^\/discover\?/);
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("state")).toBe("FL");
    expect(params.getAll("makes")).toEqual(["Ford", "Toyota"]);
  });
  it("makes all four search views visible with one active view and shared filters", () => {
    act(() =>
      root.render(
        React.createElement(InventoryViewLinks, {
          current: "/map",
          query: "state=FL&maxPrice=10000&damage=front",
        }),
      ),
    );
    expect(host.querySelectorAll("a")).toHaveLength(4);
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toContain(
      "Map",
    );
    for (const link of Array.from(host.querySelectorAll("a"))) {
      expect(link.href).toContain("damage=front");
      expect(link.href).toContain("state=FL");
    }
  });
  it("preserves a collection's location and removes even legacy timer values from display", () => {
    state.data = {
      deals: [{ id: "one", title: "Car one", secondsRemaining: 800 }],
    };
    act(() => root.render(React.createElement(FlashRail, { state: "FL" })));
    expect(state.key).toContain("state=FL");
    expect(host.querySelector("a")?.href).toContain("state=FL");
    expect(host.textContent).toContain("Car one");
    expect(host.textContent).not.toContain("left");
  });
  it("shows an unavailable collection instead of hiding failed or stale results", () => {
    state.error = new Error("offline");
    state.data = { deals: [{ id: "one", title: "Old car" }] };
    act(() => root.render(React.createElement(FlashRail)));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "not confirmed empty",
    );
    expect(host.textContent).not.toContain("Old car");
    act(() => host.querySelector("button")!.click());
    expect(state.mutate).toHaveBeenCalledOnce();
  });
  it("keeps successful empty collections quiet while loading is explicit", () => {
    state.data = { deals: [] };
    act(() => root.render(React.createElement(FlashRail)));
    expect(host.textContent).toBe("");
    state.data = undefined;
    state.loading = true;
    act(() => root.render(React.createElement(FlashRail)));
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Loading price opportunities",
    );
  });
  it("provides a read-only source-coverage retry without claiming to scrape", () => {
    const retry = vi.fn();
    act(() =>
      root.render(
        React.createElement(SearchSourceNotice, {
          error: true,
          onRetry: retry,
        }),
      ),
    );
    expect(host.textContent).toContain("Source coverage unavailable");
    act(() => host.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
  it("offers retry, not wider filters, when Discover coverage cannot be verified", () => {
    const retry = vi.fn();
    act(() =>
      root.render(
        React.createElement(CoverageNotice, {
          coverage: unavailableCoverage("private diagnostic"),
          onRetry: retry,
        }),
      ),
    );
    expect(host.textContent).toContain("could not be verified");
    expect(host.querySelector('a[href="/settings"]')).toBeNull();
    expect(host.textContent).not.toContain("private diagnostic");
    act(() => host.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
