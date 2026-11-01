// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SourcesPage from "./(dashboard)/sources/page";
const state = vi.hoisted(() => ({
  data: null as any,
  error: null as string | null,
}));
vi.mock("@/hooks/useScopedSourceHealth", () => ({
  useScopedSourceHealth: () => ({
    ...state,
    isLoading: !state.data && !state.error,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useIsAdmin", () => ({
  useIsAdmin: () => ({ isAdmin: false }),
}));
vi.mock("@/components/sources/SourceRefreshAction", () => ({
  SourceRefreshAction: () => <button>Check for new matches</button>,
}));
let root: Root, host: HTMLDivElement;
const render = async () => act(async () => root.render(<SourcesPage />));
const counts = () =>
  host.querySelector('[aria-label="Source availability counts"]')!;
const numbers = () =>
  Array.from(counts().querySelectorAll(".font-black")).map(
    (el) => el.textContent,
  );
const button = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (el) => el.textContent?.trim() === label,
  );
beforeEach(() => {
  state.data = null;
  state.error = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/sources");
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("source coverage truth during requests", () => {
  it("distinguishes unknown coverage from a confirmed empty result", async () => {
    await render();
    expect(counts().getAttribute("aria-busy")).toBe("true");
    expect(numbers()).toEqual(["—", "—", "—", "—", "—"]);
    expect(button("All —")?.disabled).toBe(true);
    state.data = { configured: true, sources: [], summary: {} };
    await render();
    expect(numbers()).toEqual(["0", "0", "0", "0", "0"]);
    expect(counts().getAttribute("aria-busy")).toBe("false");
    expect(counts().textContent).toContain("needs refresh");
    expect(counts().textContent).not.toContain("refreshing");
  });
  it("keeps failed coverage unknown and offers truthful recovery copy", async () => {
    state.error =
      "Source status is unavailable. Your search filters are unchanged.";
    await render();
    expect(counts().getAttribute("aria-busy")).toBe("false");
    expect(numbers()).toEqual(["—", "—", "—", "—", "—"]);
    expect(host.textContent).toContain(
      "Current coverage is unavailable. Your search filters are unchanged.",
    );
    expect(button("Retry coverage check")).toBeTruthy();
    expect(host.textContent).not.toContain(
      "No market has current matching listings yet.",
    );
  });
  it("keeps unverified directory volume out of the dealer card and exposes a real disclosure button", async () => {
    state.data = { configured: true, sources: [], summary: {} };
    window.history.replaceState({}, "", "/sources?source=recar");
    await render();
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Show details for ReCar"]',
    )!;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(host.textContent).not.toContain("500+");
    expect(host.textContent).not.toContain("Daily");
    await act(async () => trigger.click());
    expect(
      host
        .querySelector('[aria-label="Hide details for ReCar"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(host.textContent).toContain(
      "Directory description (not verified inventory):",
    );
  });
});
