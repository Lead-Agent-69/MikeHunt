import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  markPopState,
  useBackNavigationEntry,
  readListRestore,
  scrollWhenReachable,
  takeBackNavigationEntry,
  writeListRestore,
} from "@/hooks/useListRestore";

beforeEach(() => {
  sessionStorage.clear();
  markPopState(0);
});
afterEach(() => vi.useRealTimers());

describe("list restore storage", () => {
  it("round-trips position + pagination state per key", () => {
    writeListRestore("feed:states=TX", 2500.4, {
      offset: 108,
      items: [{ id: "a" }],
    });
    expect(readListRestore("feed:states=TX")).toMatchObject({
      y: 2500,
      state: { offset: 108, items: [{ id: "a" }] },
    });
    expect(readListRestore("feed:states=IL")).toBeNull();
  });

  it("expires after 30 minutes", () => {
    writeListRestore("scan:/api/scan?q=", 900, { morePage: 3, extra: [] });
    const raw = JSON.parse(
      sessionStorage.getItem("mh:list-restore:scan:/api/scan?q=")!,
    );
    raw.at = Date.now() - 31 * 60 * 1000;
    sessionStorage.setItem(
      "mh:list-restore:scan:/api/scan?q=",
      JSON.stringify(raw),
    );
    expect(readListRestore("scan:/api/scan?q=")).toBeNull();
  });

  it("only re-hydrates on Back/Forward, never on a fresh visit", () => {
    writeListRestore("saved:all", 2500, null);
    expect(takeBackNavigationEntry("saved:all")).toBeNull();
    markPopState();
    expect(takeBackNavigationEntry("saved:all")?.y).toBe(2500);
    expect(takeBackNavigationEntry(null)).toBeNull();
  });
});

describe("useBackNavigationEntry", () => {
  type Api = ReturnType<typeof useBackNavigationEntry>;
  const mount = () => {
    const seen: Api[] = [];
    const Probe = () => {
      seen.push(useBackNavigationEntry());
      return null;
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(createElement(Probe)));
    act(() => root.render(createElement(Probe)));
    return { seen, unmount: () => act(() => root.unmount()) };
  };

  it("decides Back at mount, so a key that settles later still restores, once", () => {
    writeListRestore("scan:/api/scan?sort=profit", 43741, {
      morePage: 3,
      extra: [],
    });
    markPopState(Date.now());
    const { seen, unmount } = mount();
    markPopState(0); // the 5s popstate window has passed by the time the key is known
    const api = seen[seen.length - 1];
    expect(seen[0]).toBe(api); // stable identity for effect deps
    expect(api.take("scan:/api/scan?sort=profit")?.y).toBe(43741);
    expect(api.take("scan:/api/scan?sort=profit")).toBeNull();
    expect(api.recentlyRestored("scan:/api/scan?sort=profit")).toBe(true);
    unmount();
  });

  it("a fresh visit never restores", () => {
    writeListRestore("feed:states=TX", 2500, { items: [] });
    const { seen, unmount } = mount();
    expect(seen[0].take("feed:states=TX")).toBeNull();
    unmount();
  });
});

describe("scrollWhenReachable", () => {
  it("waits until the re-hydrated list is tall enough, then lands on y", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      frames.push(cb),
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, "innerHeight", {
      value: 844,
      configurable: true,
    });
    let height = 900;
    Object.defineProperty(document.documentElement, "scrollHeight", {
      get: () => height,
      configurable: true,
    });
    scrollWhenReachable(2500);
    frames.shift()!(0);
    expect(scrollTo).not.toHaveBeenCalled(); // page 0 only, too short
    height = 40000; // appended pages are back
    frames.shift()!(0);
    expect(scrollTo).toHaveBeenCalledWith({ top: 2500, behavior: "instant" });
    // Late images push content: the page drifts to 2200, so the restore puts it back.
    Object.defineProperty(window, "scrollY", {
      value: 2200,
      configurable: true,
    });
    frames.shift()!(0);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    // Held at y on a stable page for 20 frames: done, no more frames requested.
    Object.defineProperty(window, "scrollY", {
      value: 2500,
      configurable: true,
    });
    for (let k = 0; k < 25 && frames.length; k++) frames.shift()!(0);
    expect(frames.length).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe("page wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("/feed restores items + offset + done keyed by its query", () => {
    const feed = read("app/(dashboard)/feed/page.tsx");
    expect(feed).toContain("backNav.take<FeedRestoreState>(`feed:${query}`)");
    expect(feed).toContain("offset.current = back.state.offset;");
    expect(feed).toContain(
      "({ items, offset: offset.current, done, boundedPool })",
    );
  });
  it("/scan restores the appended pages for the same swrKey", () => {
    const scan = read("app/(dashboard)/scan/page.tsx");
    expect(scan).toContain("swrKey ? `scan:${swrKey}` : null");
    expect(scan).toContain("[swrKey, sourceSearchKey, backNav]");
    expect(scan).toContain("setExtra(back.state.extra);");
    expect(scan).toContain("!backNav.recentlyRestored(restoreKey)");
    expect(scan).toContain("() => ({ extra, morePage })");
  });
  it("/saved restores position once the cached saves render", () => {
    const saved = read("app/(dashboard)/saved/page.tsx");
    expect(saved).toContain("const restoreKey = `saved:${filter}`;");
    expect(saved).toContain("scrollWhenReachable(back.y)");
  });
});
