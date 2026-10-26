import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const observer = vi.hoisted(() => ({
  publish: (_visible: boolean) => {},
  cleanup: vi.fn(),
}));
vi.mock("@/lib/ui/observe-scroll-reveal", () => ({
  observeScrollReveal: (
    _anchor: unknown,
    publish: (visible: boolean) => void,
  ) => {
    observer.publish = publish;
    return observer.cleanup;
  },
}));
import { ScrollSearchBar } from "@/components/search/ScrollSearchBar";
let host: HTMLDivElement;
let root: Root;
function Fixture() {
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <>
      <div ref={anchor}>
        <input
          aria-label="Original search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ScrollSearchBar
        anchorRef={anchor}
        filterButtonRef={button}
        value={query}
        onChange={setQuery}
        onFilters={() => setOpen(true)}
        paused={open}
        panelId="filters"
      />
      {open && <button onClick={() => setOpen(false)}>Close filters</button>}
    </>
  );
}
beforeEach(() => {
  observer.cleanup.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Fixture />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
it("does not duplicate searchable controls until the upward-scroll observer reveals them", () => {
  expect(
    host.querySelector('[aria-label="Search vehicles while browsing"]'),
  ).toBeNull();
  act(() => observer.publish(true));
  expect(
    host.querySelector("[data-scroll-search-bar]")?.hasAttribute("hidden"),
  ).toBe(false);
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Search vehicles while browsing"]',
  )!;
  act(() => Simulate.change(input, { target: { value: "Toyota" } } as any));
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Original search"]')
      ?.value,
  ).toBe("Toyota");
  expect(input.value).toBe("Toyota");
});
it("keeps the revealed controls mounted while filters open and close", () => {
  act(() => observer.publish(true));
  const button = host.querySelector<HTMLButtonElement>(
    '[aria-label="Open filters while browsing"]',
  )!;
  act(() => button.click());
  expect(button.getAttribute("aria-expanded")).toBe("true");
  act(() =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === "Close filters")!
      .click(),
  );
  expect(host.querySelector('[aria-label="Open filters while browsing"]')).toBe(
    button,
  );
  expect(button.getAttribute("aria-expanded")).toBe("false");
});
