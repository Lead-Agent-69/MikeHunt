import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as any,
  isLoading: false,
  fetcher: vi.fn(),
}));
vi.mock("swr", () => ({
  default: (...args: any[]) => {
    state.fetcher(...args);
    return {
      data: state.data,
      error: state.error,
      isLoading: state.isLoading,
      mutate: vi.fn(),
    };
  },
}));
vi.mock("next/dynamic", () => ({
  default: () => () => React.createElement("div", { "data-testid": "map" }),
}));
vi.mock("@/hooks/useInventoryViewScope", () => ({
  useInventoryViewScope: () => ({
    query: "",
    ready: true,
    intent: { buyerMode: "dealer" },
  }),
}));
import MapPage from "./(dashboard)/map/page";

beforeEach(() => {
  state.data = undefined;
  state.error = undefined;
  state.isLoading = false;
  state.fetcher.mockClear();
});

describe("Map inventory states", () => {
  it("starts with Go and Hold candidates and exposes an all-inventory recovery", () => {
    const html = renderToStaticMarkup(React.createElement(MapPage));
    expect(state.fetcher.mock.calls[0][0]).toBe(
      "/api/deals/map?&verdict=actionable",
    );
    expect(html).toContain("No listings in this view");
    expect(html).toContain("Show all listings");
  });

  it("shows retry on soft failure instead of calling it empty inventory", () => {
    state.data = { points: [], degraded: true };
    const html = renderToStaticMarkup(React.createElement(MapPage));
    expect(html).toContain("Map temporarily unavailable");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No listings in this view");
  });

  it("separates loading from empty and discloses approximate positions", () => {
    state.isLoading = true;
    expect(renderToStaticMarkup(React.createElement(MapPage))).toContain(
      "Loading listings",
    );
    state.isLoading = false;
    state.data = { points: [{ approx: true }, { approx: false }] };
    const html = renderToStaticMarkup(React.createElement(MapPage));
    expect(html).toContain("1 location is an approximate state-level position");
    expect(html).not.toContain("No listings in this view");
  });
});
