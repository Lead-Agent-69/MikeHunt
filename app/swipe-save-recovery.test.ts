import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: "state=TX",
  key: "",
  save: undefined as undefined | ((id: string) => void),
}));
vi.mock("@/hooks/useInventoryViewScope", () => ({
  useInventoryViewScope: () => ({
    query: state.query,
    ready: true,
    intent: { buyerMode: "personal" },
  }),
}));
vi.mock("swr", () => ({
  default: (key: string) => {
    state.key = key;
    return {
      data: {
        vehicles: [
          { id: "car", title: "Test car", askPrice: 5000, sellEstimate: 9000 },
        ],
        total: 1,
      },
      isLoading: false,
      mutate: vi.fn(),
    };
  },
}));
vi.mock("@/components/ui/framer-components", () => ({
  SwipeCardStack: ({ cards, onSave }: any) => {
    state.save = onSave;
    return React.createElement("div", null, cards[0]?.content);
  },
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: any) => React.createElement("div", null, children),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import SwipePage from "./(dashboard)/swipe/page";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  state.query = "state=TX";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it("preserves a failed save for retry and counts only confirmed writes", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => root.render(React.createElement(SwipePage)));
  expect(state.key).toContain("/api/scan?state=TX");
  expect(host.textContent).toContain("$5,000");
  expect(host.textContent).not.toContain("Resale basis");
  await act(async () => state.save!("car"));
  expect(host.textContent).toContain("0 saved");
  expect(host.textContent).toContain("1 save not completed");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(host.textContent).toContain("1 saved");
  expect(host.textContent).not.toContain("save not completed");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("does not attribute an earlier search's pending save to a new search", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  await act(async () => root.render(React.createElement(SwipePage)));
  act(() => state.save!("car"));
  state.query = "state=CA";
  await act(async () => root.render(React.createElement(SwipePage)));
  await act(async () => resolve({ ok: true }));
  expect(host.textContent).toContain("0 saved");
  expect(state.key).toContain("state=CA");
});
