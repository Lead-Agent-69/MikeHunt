import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/deal-check",
  params: new URLSearchParams(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => state.params,
  useRouter: () => state.router,
}));
vi.mock("next/link", () => ({
  default: ({ children, prefetch: _, ...props }: any) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "reseller" } }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: null, loading: true }),
}));
vi.mock("@/components/shared/MyStatesButton", () => ({
  MyStatesButton: () => <button>Location</button>,
}));
vi.mock("@/components/shared/ThemeToggle", () => ({
  ThemeToggle: () => <button>Theme</button>,
}));
vi.mock("@/components/home/AccountMenu", () => ({
  AccountMenu: () => <button>Account</button>,
}));
import { TopNav } from "@/components/layout/TopNav";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.pathname = "/deal-check";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("publishes resized header layout height for sticky controls and clears it on unmount", async () => {
  let resize: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const height = vi
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockReturnValue(113);
  await act(async () => root.render(<TopNav />));
  expect(
    document.documentElement.style.getPropertyValue("--top-nav-height"),
  ).toBe("113px");
  height.mockReturnValue(56);
  act(() => resize());
  expect(
    document.documentElement.style.getPropertyValue("--top-nav-height"),
  ).toBe("56px");
  act(() => root.unmount());
  expect(disconnect).toHaveBeenCalledOnce();
  expect(
    document.documentElement.style.getPropertyValue("--top-nav-height"),
  ).toBe("");
  root = createRoot(host);
});

it("marks desktop All tools current on Deal Check, matching the mobile workflow owner", async () => {
  await act(async () => root.render(<TopNav />));
  expect(
    host
      .querySelector('a[aria-label="All tools"]')
      ?.getAttribute("aria-current"),
  ).toBe("page");
  expect(
    host.querySelector(
      'nav[aria-label="Primary desktop navigation"] a[aria-current]',
    ),
  ).toBeNull();
});

it("moves the desktop current state back to Saved without leaving Tools selected", async () => {
  await act(async () => root.render(<TopNav />));
  state.pathname = "/saved";
  await act(async () => root.render(<TopNav />));
  expect(
    host
      .querySelector('a[aria-label="All tools"]')
      ?.hasAttribute("aria-current"),
  ).toBe(false);
  expect(
    host
      .querySelector(
        'nav[aria-label="Primary desktop navigation"] a[aria-current="page"]',
      )
      ?.getAttribute("href"),
  ).toBe("/saved");
});
