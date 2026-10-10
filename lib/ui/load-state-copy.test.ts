import { describe, expect, it } from "vitest";
import {
  savedSyncStatus,
  savedWatchlistHeadline,
  scanStatusCopy,
} from "./load-state-copy";

describe("scanStatusCopy", () => {
  it("shows a loading state, not '0 · never', before the first /api/scan response", () => {
    const copy = scanStatusCopy({
      hasData: false,
      error: null,
      total: 0,
      lastLoadedAt: null,
    });
    expect(copy.count).toBeNull();
    expect(copy.countLabel).toBe("Loading listings…");
    expect(copy.lastLoaded).toBe("loading…");
    expect(JSON.stringify(copy)).not.toMatch(/never|\b0\b/);
  });

  it("says not loaded on a failed first load instead of a fake zero", () => {
    const copy = scanStatusCopy({
      hasData: false,
      error: "boom",
      total: 0,
      lastLoadedAt: null,
    });
    expect(copy.count).toBeNull();
    expect(copy.lastLoaded).toBe("not yet");
  });

  it("shows the real total once data arrives (a real zero is still zero)", () => {
    expect(
      scanStatusCopy({
        hasData: true,
        error: null,
        total: 246,
        lastLoadedAt: null,
      }),
    ).toMatchObject({ count: "246", countLabel: "active listings" });
    expect(
      scanStatusCopy({
        hasData: true,
        error: null,
        total: 0,
        lastLoadedAt: null,
      }).count,
    ).toBe("0");
  });
});

describe("saved watchlist status", () => {
  const base = {
    authLoading: false,
    userId: "u1",
    fetchLoading: false,
    hasData: false,
    error: null,
  };

  it("stays 'checking' while auth resolves or the first fetch is in flight", () => {
    expect(savedSyncStatus({ ...base, authLoading: true, userId: null })).toBe(
      "checking",
    );
    // Signed in, SWR key just armed: no data, no error, not yet flagged loading.
    expect(savedSyncStatus(base)).toBe("checking");
    expect(savedSyncStatus({ ...base, fetchLoading: true })).toBe("checking");
    expect(savedWatchlistHeadline("checking", false)).toBe(
      "Checking your account watchlist…",
    );
  });

  it("only shows the load error after auth resolved and the fetch failed", () => {
    const status = savedSyncStatus({ ...base, error: new Error("500") });
    expect(status).toBe("unavailable");
    expect(savedWatchlistHeadline(status, false)).toBe(
      "Could not load your account watchlist.",
    );
  });

  it("ready / guest paths", () => {
    expect(savedSyncStatus({ ...base, hasData: true })).toBe("ready");
    expect(savedSyncStatus({ ...base, userId: null })).toBe("guest");
    expect(savedWatchlistHeadline("guest", true)).toBe(
      "Your watchlist is saved on this device.",
    );
  });
});
