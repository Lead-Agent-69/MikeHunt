import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  markPopState,
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
    vi.unstubAllGlobals();
  });
});

describe("page wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("/feed restores items + offset + done keyed by its query", () => {
    const feed = read("app/(dashboard)/feed/page.tsx");
    expect(feed).toContain(
      "takeBackNavigationEntry<FeedRestoreState>(`feed:${query}`)",
    );
    expect(feed).toContain("offset.current = back.state.offset;");
    expect(feed).toContain(
      "({ items, offset: offset.current, done, boundedPool })",
    );
  });
  it("/scan restores the appended pages for the same swrKey", () => {
    const scan = read("app/(dashboard)/scan/page.tsx");
    expect(scan).toContain("swrKey ? `scan:${swrKey}` : null");
    expect(scan).toContain("setExtra(restoring ? back!.state.extra : [])");
    expect(scan).toContain("() => ({ extra, morePage })");
  });
  it("/saved restores position once the cached saves render", () => {
    const saved = read("app/(dashboard)/saved/page.tsx");
    expect(saved).toContain("const restoreKey = `saved:${filter}`;");
    expect(saved).toContain("scrollWhenReachable(back.y)");
  });
});
