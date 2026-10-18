import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inventoryScopeStates,
  inventoryScopeLabel,
} from "@/lib/search/inventory-view-scope";
const saved = vi.hoisted(() => ({ states: undefined as string[] | undefined }));

vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({
    intent: { buyerMode: "personal", maxPrice: 10000 },
    isLoading: false,
    savedStates: saved.states,
  }),
  buildBuyerIntentQuery: () =>
    new URLSearchParams("state=TX&maxPrice=10000&q=truck"),
}));
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
function Surface() {
  const { query, ready } = useInventoryViewScope();
  return React.createElement(
    "div",
    null,
    React.createElement("output", null, ready ? query : "waiting"),
    React.createElement(InventoryViewLinks, { query, current: "/map" }),
  );
}
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  saved.states = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
  window.history.replaceState(null, "", "/map");
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("cross-view scope preservation", () => {
  it("labels a radius search as local rather than nationwide", () => {
    expect(
      inventoryScopeLabel(new URLSearchParams("zip=63101&radius=50")),
    ).toBe("50 mi of 63101");
    expect(
      inventoryScopeLabel(new URLSearchParams("zip=63101&radius=-1")),
    ).toBe("100 mi of 63101");
    expect(inventoryScopeLabel(new URLSearchParams("states=MO,IL"))).toBe(
      "MO, IL",
    );
  });
  it("keeps unsupported wider searches in Results instead of silently narrowing other views", async () => {
    window.history.replaceState(
      null,
      "",
      "/map?scope=explicit&zip=63101&radius=1000",
    );
    await act(async () => root.render(React.createElement(Surface)));
    expect(
      host.querySelector('a[href^="/map"]')!.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      host.querySelector('a[href^="/market"]')!.getAttribute("aria-disabled"),
    ).toBeNull();
    expect(host.textContent).toContain(
      "wider search stays available in Results",
    );
  });
  it("explains photo-only views without silently removing the no-photo constraint", async () => {
    window.history.replaceState(null, "", "/map?scope=explicit&hasPhotos=no");
    await act(async () => root.render(React.createElement(Surface)));
    const feed = host.querySelector('a[href^="/feed"]')!;
    expect(feed.getAttribute("aria-disabled")).toBe("true");
    expect(feed.getAttribute("href")).toContain("hasPhotos=no");
    expect(host.textContent).toContain("Feed and Swipe require photos");
  });
  it("preserves every selected market rather than just the onboarding state", async () => {
    saved.states = ["MO", "TX", "IL", "FL"];
    await act(async () => root.render(React.createElement(Surface)));
    const params = new URLSearchParams(
      host.querySelector("output")!.textContent!,
    );
    expect(params.get("states")).toBe("MO,TX,IL,FL");
    expect(params.has("state")).toBe(false);
    expect(params.get("maxPrice")).toBe("10000");
    const href = host
      .querySelector<HTMLAnchorElement>('a[href^="/feed"]')!
      .getAttribute("href")!;
    expect(
      new URL(href, "https://example.com").searchParams.get("states"),
    ).toBe("MO,TX,IL,FL");
  });
  it("respects a saved nationwide selection without resurrecting the onboarding state", async () => {
    saved.states = [];
    await act(async () => root.render(React.createElement(Surface)));
    const params = new URLSearchParams(
      host.querySelector("output")!.textContent!,
    );
    expect(params.has("state")).toBe(false);
    expect(params.has("states")).toBe(false);
  });
  it("lets an explicit single state override all saved markets", async () => {
    saved.states = ["MO", "TX", "IL", "FL"];
    window.history.replaceState(null, "", "/map?state=CA");
    await act(async () => root.render(React.createElement(Surface)));
    const params = new URLSearchParams(
      host.querySelector("output")!.textContent!,
    );
    expect(params.get("state")).toBe("CA");
    expect(params.has("states")).toBe(false);
  });
  it("uses saved buyer scope when a view has no explicit search", async () => {
    await act(async () => root.render(React.createElement(Surface)));
    const params = new URLSearchParams(
      host.querySelector("output")!.textContent!,
    );
    expect(params.get("state")).toBe("TX");
    expect(params.get("maxPrice")).toBe("10000");
  });
  it("does not resurrect saved budgets or vehicle queries in an explicit all-inventory link", async () => {
    window.history.replaceState(
      null,
      "",
      "/map?scope=explicit&state=all&maxPrice=&q=",
    );
    await act(async () => root.render(React.createElement(Surface)));
    const params = new URLSearchParams(
      host.querySelector("output")!.textContent!,
    );
    expect(params.get("state")).toBe("all");
    expect(params.has("maxPrice")).toBe(false);
    expect(params.has("q")).toBe(false);
    const href = host
      .querySelector<HTMLAnchorElement>('a[href^="/swipe"]')!
      .getAttribute("href")!;
    expect(href).toContain("scope=explicit");
    expect(href).not.toContain("maxPrice");
  });
  it("restores advanced details and updates on browser back navigation", async () => {
    window.history.replaceState(
      null,
      "",
      "/map?scope=explicit&runDrive=unknown&minBuyNow=500",
    );
    await act(async () => root.render(React.createElement(Surface)));
    expect(host.querySelector("output")!.textContent).toContain(
      "runDrive=unknown",
    );
    act(() => {
      window.history.replaceState(null, "", "/map?scope=explicit&state=CA");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector("output")!.textContent).toContain("state=CA");
    expect(host.querySelector("output")!.textContent).not.toContain("runDrive");
  });
  it("keeps nationwide and explicit empty scope distinct from an unset location", () => {
    expect(inventoryScopeStates(new URLSearchParams("state=all"))).toEqual([]);
    expect(inventoryScopeStates(new URLSearchParams("states="))).toEqual([]);
    expect(
      inventoryScopeStates(new URLSearchParams("state=Nationwide")),
    ).toEqual([]);
    expect(inventoryScopeStates(new URLSearchParams())).toBeUndefined();
    expect(inventoryScopeStates(new URLSearchParams("states=tx,ca"))).toEqual([
      "TX",
      "CA",
    ]);
  });
  it("refreshes an explicit shared search when the header changes location", async () => {
    window.history.replaceState(null, "", "/map?scope=explicit&state=TX");
    await act(async () => root.render(React.createElement(Surface)));
    act(() => {
      window.history.replaceState(null, "", "/map?scope=explicit&state=CA");
      window.dispatchEvent(new Event("inventory-scope-change"));
    });
    expect(host.querySelector("output")!.textContent).toContain("state=CA");
  });
});
