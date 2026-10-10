import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IntelRail } from "@/components/discovery/IntelRail";

const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as unknown,
  isValidating: false,
  mutate: vi.fn(),
}));
vi.mock("swr", () => ({ default: () => state }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/components/discovery/DiscoveryCard", () => ({
  DiscoveryCard: ({ deal }: any) =>
    React.createElement("a", { href: `/deal/${deal.id}` }, deal.title),
}));
vi.mock("framer-motion", () => ({
  motion: {
    section: ({ children, className }: any) =>
      React.createElement("section", { className }, children),
    div: ({ children, className }: any) =>
      React.createElement("div", { className }, children),
  },
}));
let root: Root;
let container: HTMLDivElement;
async function render() {
  await act(async () =>
    root.render(
      React.createElement(IntelRail, {
        endpoint: "/api/deals/near",
        title: "Near you",
      }),
    ),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(state, {
    data: undefined,
    error: undefined,
    isValidating: false,
  });
  state.mutate.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it.each([
  ["needsSignIn", "Sign in again", "/login?next=%2Fdiscover"],
  ["needsState", "Choose your home state", "/settings"],
  ["needsLocation", "Add your home ZIP", "/settings"],
])("offers recovery for %s", async (flag, message, href) => {
  state.data = { [flag]: true, deals: [] };
  await render();
  expect(container.textContent).toContain(message);
  expect(container.querySelector("a")?.getAttribute("href")).toBe(href);
});
it("offers retry without showing internal errors", async () => {
  state.error = new Error("private backend diagnostic");
  await render();
  expect(container.textContent).toContain("Could not load these vehicles");
  expect(container.textContent).not.toContain("private backend diagnostic");
  await act(async () => container.querySelector("button")!.click());
  expect(state.mutate).toHaveBeenCalledOnce();
  state.isValidating = true;
  await render();
  expect(container.querySelector("button")?.disabled).toBe(true);
});
it("retains previously loaded cars when refresh fails", async () => {
  state.data = { deals: [{ id: "saved-result", title: "Honda Civic" }] };
  state.error = new Error("offline");
  await render();
  expect(container.textContent).toContain("previous results are still here");
  expect(
    container.querySelector('a[href="/deal/saved-result"]'),
  ).not.toBeNull();
});
it("does not show a failure for a genuinely empty response", async () => {
  state.data = { deals: [] };
  await render();
  expect(container.textContent).toBe("");
});
