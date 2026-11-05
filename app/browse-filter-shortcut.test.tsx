import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
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
import { BrowseFilterShortcut } from "@/components/search/BrowseFilterShortcut";
let host: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("reveals the same scoped filter destination while browsing and removes its listener on unmount", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  observer.cleanup.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <BrowseFilterShortcut query="states=MO%2CIL&zip=63101&radius=100&q=Ford&scope=explicit" />,
    ),
  );
  expect(host.querySelectorAll("a")).toHaveLength(1);
  const href = host.querySelector("a")!.href;
  act(() => observer.publish(true));
  const region = host.querySelector(
    '[aria-label="Refine search while browsing"]',
  )!;
  expect(region.querySelector("a")!.href).toBe(href);
  expect(new URL(href).searchParams.get("states")).toBe("MO,IL");
  expect(new URL(href).searchParams.get("filters")).toBe("open");
  act(() => observer.publish(false));
  expect(host.querySelectorAll("a")).toHaveLength(1);
  act(() => root.render(<></>));
  expect(observer.cleanup).toHaveBeenCalledTimes(1);
});

it("keeps Feed search context and active criteria visible in its upward-scroll controls", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <BrowseFilterShortcut
        current="/feed"
        query="states=MO&zip=63101&radius=75&q=Ford&maxMileage=50000&maxPrice=20000&minYear=2018"
      />,
    ),
  );
  act(() => observer.publish(true));
  const region = host.querySelector(
    '[aria-label="Refine search while browsing"]',
  )!;
  expect(region.textContent).toContain("Ford · Within 75 mi of 63101");
  const links = region.querySelectorAll("a");
  expect(links[0].textContent).toBe("Results");
  expect(links[1].textContent).toContain("Search & filters3");
  expect(new URL(links[1].href).searchParams.get("maxMileage")).toBe("50000");
});
