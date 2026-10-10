import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => {
  const strip = ({
    variants: _v,
    initial: _i,
    animate: _a,
    custom: _c,
    onAnimationComplete: _o,
    ...rest
  }: Record<string, unknown>) => rest;
  const MotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    (props, ref) => createElement("div", { ...strip(props), ref }),
  );
  MotionDiv.displayName = "MotionDiv";
  return { motion: { div: MotionDiv } };
});
import {
  ANIMATED_CARDS,
  VirtualCardGrid,
  columnsFor,
  readRowSnapshot,
} from "@/components/scan/VirtualCardGrid";

type Car = { id: string; title: string };
const cars: Car[] = Array.from({ length: 384 }, (_, i) => ({
  id: `car-${i}`,
  title: `Car ${i}`,
}));

let host: HTMLDivElement;
let root: Root;
const setScroll = (y: number) => {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  Object.defineProperty(window, "pageYOffset", {
    value: y,
    configurable: true,
  });
  window.dispatchEvent(new Event("scroll"));
};

// jsdom has no layout: rows report a real height so the virtualizer measures something.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return this.hasAttribute("data-row") ? 700 : 0;
  },
});

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "innerWidth", {
    value: 390,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 844,
    configurable: true,
  });
  setScroll(0);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (items: Car[] = cars) =>
  act(() =>
    root.render(
      createElement(VirtualCardGrid<Car>, {
        items,
        getKey: (c) => c.id,
        initialViewport: { width: 390, height: 844 },
        renderItem: (c) =>
          createElement("a", { href: `/deal/${c.id}` }, c.title),
      }),
    ),
  );

describe("/scan VirtualCardGrid", () => {
  it("mirrors the old grid breakpoints (1/2/3 and compact 2/3/4/5)", () => {
    expect(
      [390, 700, 1100, 1400].map((w) => columnsFor(w, "comfortable")),
    ).toEqual([1, 2, 3, 3]);
    expect([390, 700, 1100, 1400].map((w) => columnsFor(w, "compact"))).toEqual(
      [2, 3, 4, 5],
    );
  });

  it("keeps list semantics and only mounts rows near the viewport", () => {
    render();
    const list = host.querySelector('[role="list"]')!;
    expect(list.getAttribute("aria-label")).toBe("Search results");
    const items = list.querySelectorAll('[role="listitem"]');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(20); // not 384
    expect(items[0].getAttribute("aria-posinset")).toBe("1");
    expect(items[0].getAttribute("aria-setsize")).toBe("384");
    // Every wrapper between list and listitem is role="none".
    for (const row of Array.from(list.children))
      expect(row.getAttribute("role")).toBe("none");
    // The container reserves the full height so the scrollbar and load-more sentinel stay put.
    expect(parseInt((list as HTMLElement).style.height, 10)).toBeGreaterThan(
      384 * 500,
    );
  });

  it("does not unmount the focused card while scrolling away", () => {
    render();
    const link = host.querySelector(
      'a[href="/deal/car-0"]',
    ) as HTMLAnchorElement;
    act(() => link.focus());
    expect(document.activeElement).toBe(link);
    act(() => setScroll(60000));
    expect(host.querySelector('a[href="/deal/car-0"]')).toBe(link);
    expect(document.activeElement).toBe(link);
    // Far rows are mounted now, near the new scroll position.
    const shown = Array.from(host.querySelectorAll("[data-card-index]")).map(
      (e) => Number(e.getAttribute("data-card-index")),
    );
    expect(Math.max(...shown)).toBeGreaterThan(50);
  });

  it("grows with load-more without dropping the first batch", () => {
    render(cars.slice(0, 48));
    const h1 = parseInt(
      (host.querySelector('[role="list"]') as HTMLElement).style.height,
      10,
    );
    render(cars.slice(0, 96));
    const h2 = parseInt(
      (host.querySelector('[role="list"]') as HTMLElement).style.height,
      10,
    );
    expect(h2).toBeGreaterThan(h1);
    expect(
      host.querySelector('[aria-posinset="1"]')!.getAttribute("aria-setsize"),
    ).toBe("96");
  });
});

describe("row-height snapshot for Back navigation", () => {
  it("saves measured rows on unmount under restoreKey|columns and reads them back", async () => {
    sessionStorage.clear();
    // beforeEach dispatched a scroll; rows are only measured once the virtualizer stops "scrolling".
    await new Promise((r) => setTimeout(r, 250));
    act(() =>
      root.render(
        createElement(VirtualCardGrid<Car>, {
          items: cars,
          getKey: (c) => c.id,
          restoreKey: "scan:/api/scan?q=civic",
          initialViewport: { width: 390, height: 844 },
          renderItem: (c) =>
            createElement("a", { href: `/deal/${c.id}` }, c.title),
        }),
      ),
    );
    act(() => root.render(createElement("div")));
    const snap = readRowSnapshot("scan:/api/scan?q=civic|1");
    expect(snap?.length).toBeGreaterThan(0);
    expect(snap![0]).toMatchObject({ index: 0, start: expect.any(Number) });
    expect(snap![0].size).toBe(700);
    expect(readRowSnapshot("scan:/api/scan?q=civic|3")).toBeUndefined();
  });
});

describe("/scan page wiring", () => {
  const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
  it("renders grid view through VirtualCardGrid and keeps load-more after it", () => {
    expect(scan).toContain("<VirtualCardGrid");
    expect(scan).toContain('label="Vehicle results"');
    expect(scan).toContain("restoreKey={swrKey ? `scan:${swrKey}` : null}");
    expect(scan.indexOf("<VirtualCardGrid")).toBeLessThan(
      scan.indexOf("ref={sentinelRef}"),
    );
    expect(scan).not.toContain("staggerChildren: 0.06");
  });
  it("only the first screen animates", () => {
    expect(ANIMATED_CARDS).toBe(12);
  });
});
