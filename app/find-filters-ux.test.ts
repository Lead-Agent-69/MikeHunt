import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AlsoSearchOn,
  FILTER_NAMES,
} from "@/components/multisite/AlsoSearchOn";
import { buildMultiSiteLinks } from "@/lib/multisite";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const initial = {
  make: "Honda",
  model: "Civic",
  zip: "60432",
  fuel: "hybrid" as const,
};

describe("Also search on — disclosure, targets, external links", () => {
  it("More filters is a button with aria-expanded / aria-controls that toggles the panel", () => {
    act(() => root.render(createElement(AlsoSearchOn, { initial })));
    const btn = host.querySelector("[aria-controls]") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.textContent).toContain("More filters");
    expect(btn.textContent).toContain("(1 set)");
    const panel = document.getElementById(btn.getAttribute("aria-controls")!)!;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hidden).toBe(true);
    expect(panel.className).toMatch(/\bhidden\b/);
    act(() => btn.click());
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(panel.className).toMatch(/\bgrid\b/);
    expect(host.querySelector("details")).toBeNull();
  });

  it("controls and links are at least 44px (min-h-11)", () => {
    act(() => root.render(createElement(AlsoSearchOn, { initial })));
    const els = host.querySelectorAll("input, select, button, a");
    expect(els.length).toBeGreaterThan(10);
    for (const el of Array.from(els))
      expect(el.className).toContain("min-h-11");
  });

  it("external links open in a new tab, show an icon and say so to screen readers", () => {
    act(() => root.render(createElement(AlsoSearchOn, { initial })));
    const links = Array.from(
      host.querySelectorAll('[data-testid="also-search-on-links"] a'),
    );
    expect(links.length).toBeGreaterThan(3);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(a.querySelector(".sr-only")?.textContent).toContain(
        "opens in a new tab",
      );
      expect(a.hasAttribute("title")).toBe(false);
    }
  });

  it("filters a site can't carry are listed as text, not only in a hover tooltip", () => {
    act(() => root.render(createElement(AlsoSearchOn, { initial })));
    const dropped = buildMultiSiteLinks({ ...initial, radiusMi: 50 }).filter(
      (l) => l.dropped.length,
    );
    // hybrid fuel is dropped by several sites today; keep the case exercised.
    expect(dropped.length).toBeGreaterThan(0);
    const note = host.querySelector('[data-testid="also-search-on-dropped"]');
    for (const l of dropped)
      expect(note?.textContent).toContain(
        `${l.label}: ${l.dropped.map((d) => FILTER_NAMES[d]).join(", ")}`,
      );
    expect(note?.textContent).not.toMatch(/hover/i);
  });
});
