import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScrollSearchBar } from "@/components/search/ScrollSearchBar";

let host: HTMLDivElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;

function Fixture() {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchor} />
      <ScrollSearchBar
        anchorRef={anchor}
        value="Toyota"
        onChange={() => {}}
        onFilters={() => {}}
      />
      <button aria-label="Outside search">Outside</button>
    </>
  );
}

function scroll(y: number) {
  vi.stubGlobal("scrollY", y);
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}
const bar = () => host.querySelector<HTMLElement>("[data-scroll-search-bar]")!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollY", 1200);
  frames = new Map();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: -100,
  } as DOMRect);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Fixture />));
  scroll(1170);
  expect(bar().hidden).toBe(false);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the focused Filters control mounted during downward scrolling, then releases after focus leaves", () => {
  const filters = host.querySelector<HTMLButtonElement>(
    '[aria-label="Open filters while browsing"]',
  )!;
  act(() => filters.focus());
  expect(filters.matches(":focus-visible")).toBe(true);
  scroll(1250);
  expect(bar().hidden).toBe(false);
  expect(document.activeElement).toBe(filters);
  expect(filters.isConnected).toBe(true);

  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Outside search"]')!
      .focus(),
  );
  scroll(1300);
  expect(bar().hidden).toBe(true);
  expect(filters.isConnected).toBe(false);
});

it("retains the existing text-entry lock without pinning the bar after blur", () => {
  const input = host.querySelector<HTMLInputElement>("input")!;
  act(() => input.focus());
  scroll(1250);
  expect(bar().hidden).toBe(false);
  expect(input.value).toBe("Toyota");
  act(() => input.blur());
  scroll(1300);
  expect(bar().hidden).toBe(true);
});
