import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createClientComponentClient: () => ({}) }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {}, isLoading: false }),
}));
vi.mock("@/components/shared/MyStatesButton", () => ({
  MyStatesButton: () => null,
}));
vi.mock("@/components/ui/editorial-card", () => ({
  EditorialCard: () => null,
}));
vi.mock("@/components/shared/DataSetupState", () => ({
  DataSetupState: ({ title }: { title: string }) =>
    React.createElement("p", null, title),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) =>
    React.createElement("a", props, children),
}));
import FeedPage from "./(dashboard)/feed/page";
import AuctionsPage from "./(dashboard)/auctions/page";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let element: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  element = document.createElement("div");
  root = createRoot(element);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(component: React.ComponentType) {
  await act(async () => {
    root.render(React.createElement(component));
  });
}
async function retry() {
  const button = Array.from(element.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Try again"),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
}

describe("Inventory request recovery", () => {
  it("recovers Feed from a soft API failure without declaring the inventory empty", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "Feed unavailable", items: [] }),
    });
    await render(FeedPage);
    expect(element.textContent).toContain("Feed temporarily unavailable");
    expect(element.textContent).not.toContain("No photo-ready feed items yet");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], nextOffset: 0 }),
    });
    await retry();
    expect(element.textContent).toContain("No photo-ready feed items yet");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers Auctions from HTTP failure without telling users their saved lists are gone", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await render(AuctionsPage);
    expect(element.textContent).toContain(
      "Auction lists temporarily unavailable",
    );
    expect(element.textContent).not.toContain("No Run Lists Uploaded");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await retry();
    expect(element.textContent).toContain("No Run Lists Uploaded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
