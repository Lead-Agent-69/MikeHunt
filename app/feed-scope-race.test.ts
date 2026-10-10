import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const scopeState = vi.hoisted(() => ({
  query: "state=TX",
  displayedStates: undefined as string[] | undefined,
}));
vi.mock("@/hooks/useInventoryViewScope", () => ({
  useInventoryViewScope: () => ({ query: scopeState.query, ready: true }),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {}, isLoading: false }),
}));
vi.mock("@/components/shared/MyStatesButton", () => ({
  MyStatesButton: ({ onChange, statesOverride }: any) => {
    scopeState.displayedStates = statesOverride;
    return React.createElement(
      "button",
      { onClick: () => onChange(["CA"]) },
      "Choose California",
    );
  },
}));
vi.mock("@/components/ui/editorial-card", () => ({
  EditorialCard: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) =>
    React.createElement("a", props, children),
}));
import FeedPage from "./(dashboard)/feed/page";
let root: Root;
afterEach(() => {
  if (root) act(() => root.unmount());
  vi.unstubAllGlobals();
  scopeState.query = "state=TX";
});

describe("Feed scope request isolation", () => {
  it("replaces the initial location when a shared header search changes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const fetchMock = vi.fn((_url: string) => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(React.createElement(FeedPage)));
    expect(scopeState.displayedStates).toEqual(["TX"]);
    scopeState.query = "scope=explicit&state=CA";
    await act(async () => root.render(React.createElement(FeedPage)));
    expect(fetchMock.mock.calls.at(-1)![0]).toContain("states=CA");
    expect(scopeState.displayedStates).toEqual(["CA"]);
    scopeState.query = "scope=explicit";
    await act(async () => root.render(React.createElement(FeedPage)));
    expect(fetchMock.mock.calls.at(-1)![0]).toContain("states=&");
    expect(scopeState.displayedStates).toEqual([]);
  });
  it("ignores an older state's response after the user selects a new market", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const pending: Array<(value: any) => void> = [];
    const fetchMock = vi.fn(
      (_url: string) => new Promise((resolve) => pending.push(resolve)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => root.render(React.createElement(FeedPage)));
    expect(fetchMock.mock.calls[0][0]).toContain("states=TX");
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(fetchMock.mock.calls[1][0]).toContain("states=CA");
    await act(async () =>
      pending[0]({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "old",
              make: "OLD",
              model: "STATE",
              title: "Old scope",
              askPrice: 1000,
            },
          ],
        }),
      }),
    );
    expect(host.textContent).not.toContain("OLD");
    await act(async () =>
      pending[1]({
        ok: true,
        json: async () => ({ items: [], nextOffset: 12 }),
      }),
    );
    expect(host.textContent).toContain("No photo-ready feed items yet");
    expect(host.textContent).not.toContain("Feed temporarily unavailable");
  });
});
