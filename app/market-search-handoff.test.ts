import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarketSearchHandoff,
  MarketSearchShortcut,
} from "@/components/search/MarketSearchHandoff";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("market search handoff", () => {
  it("separates external coverage and makes dropped filters explicit", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        React.createElement(MarketSearchHandoff, {
          query: "make=Ford&model=Bronco+Sport&state=TX&damage=flood",
        }),
      ),
    );
    expect(host.textContent).toContain(
      "External results are separate from our indexed inventory",
    );
    expect(host.textContent).toContain("Statewide: TX");
    expect(host.querySelector("li summary")?.textContent).toContain(
      "1 filter to confirm",
    );
    expect(host.textContent).toContain("Not transferred: Damage: flood");
    const links = Array.from(host.querySelectorAll("a"));
    expect(links.length).toBeGreaterThan(3);
    expect(new URL(links[0].href).searchParams.get("model_kw")).toBe(
      "Bronco Sport",
    );
    expect(host.textContent).not.toMatch(/Visor|Copart/);
    expect(links.some((link) => link.href.includes("cars.com"))).toBe(true);
    expect(links.some((link) => link.href.includes("autotrader.com"))).toBe(
      true,
    );
    expect(host.textContent).toContain("more marketplaces");
    expect(host.querySelector("section")?.id).toBe("wider-market-search");
    expect(host.querySelector("section")?.tabIndex).toBe(-1);
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
      expect(link.getAttribute("aria-label")).toContain("opens in a new tab");
    }
  });
  it("keeps secondary marketplaces collapsed until the shortcut is used", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(MarketSearchShortcut, { query: "make=Honda" }),
          React.createElement(MarketSearchHandoff, { query: "make=Honda" }),
        ),
      ),
    );
    const disclosure =
      host.querySelector<HTMLDetailsElement>("section > details")!;
    expect(disclosure.open).toBe(false);
    act(() => host.querySelector("a")!.click());
    expect(disclosure.open).toBe(true);
    expect(disclosure.querySelectorAll("a").length).toBeGreaterThan(3);
  });
  it("keeps the shortcut reachable without pointing to an absent section", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        React.createElement(MarketSearchShortcut, { query: "make=Honda" }),
      ),
    );
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "#wider-market-search",
    );
    act(() =>
      root?.render(
        React.createElement(MarketSearchShortcut, { query: "body=Motorcycle" }),
      ),
    );
    expect(host.querySelector("a")).toBeNull();
  });
  it("updates source reach with the active criteria, without issuing requests", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        React.createElement(MarketSearchHandoff, {
          query: "make=Honda&model=Civic&zip=60601&radius=50",
        }),
      ),
    );
    expect(host.querySelectorAll("a").length).toBeGreaterThan(4);
    act(() =>
      root?.render(
        React.createElement(MarketSearchHandoff, {
          query:
            "make=Ford&model=F-150&zip=63021&radius=100&sellerType=private",
        }),
      ),
    );
    const links = Array.from(host.querySelectorAll("a"));
    expect(links).toHaveLength(2);
    expect(new URL(links[0].href).searchParams.get("zip")).toBe("63021");
    expect(new URL(links[0].href).searchParams.get("saleby")).toBe("private");
    expect(new URL(links[1].href).searchParams.get("postal")).toBe("63021");
    expect(host.textContent).not.toContain("Cars.com");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("does not expose unknown query data or send incompatible vehicles to car sites", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        React.createElement(MarketSearchHandoff, {
          query: "make=Honda&token=private-value&user_id=private-owner",
        }),
      ),
    );
    expect(host.innerHTML).not.toMatch(/private-value|private-owner/);
    act(() =>
      root?.render(
        React.createElement(MarketSearchHandoff, {
          query: "make=Honda&body=Motorcycle",
        }),
      ),
    );
    expect(host.querySelector("section")).toBeNull();
  });
});
