import { describe, expect, it } from "vitest";
import {
  MAX_WATCHED_DEALERS,
  compactWatchList,
  mergeWatchedHosts,
  sanitizeWatchListPatch,
  toggleWatchedHost,
} from "./watched-dealers";

describe("watched dealers prefs", () => {
  it("compacts, dedupes and caps", () => {
    expect(
      compactWatchList([" a.com ", "a.com", 3, "", null, "b.com"]),
    ).toEqual(["a.com", "b.com"]);
    const many = Array.from({ length: 500 }, (_, i) => `h${i}.com`);
    expect(compactWatchList(many)).toHaveLength(MAX_WATCHED_DEALERS);
    expect(compactWatchList("a.com")).toEqual([]);
  });

  it("merges legacy localStorage hosts after saved hosts once", () => {
    expect(mergeWatchedHosts(["a.com"], ["b.com", "a.com"])).toEqual([
      "a.com",
      "b.com",
    ]);
    expect(mergeWatchedHosts(undefined, ["b.com"])).toEqual(["b.com"]);
  });

  it("toggles a host and returns both pref keys", () => {
    const added = toggleWatchedHost(["a.com"], "b.com");
    expect(added.watchedDealerHosts).toEqual(["a.com", "b.com"]);
    expect(Array.isArray(added.watchedDealerSourceIds)).toBe(true);
    const removed = toggleWatchedHost(added.watchedDealerHosts, "a.com");
    expect(removed.watchedDealerHosts).toEqual(["b.com"]);
  });

  it("rejects non-string watch lists in a prefs patch", () => {
    expect(sanitizeWatchListPatch({ watchedDealerHosts: "a.com" })).toEqual({
      error: "watchedDealerHosts must be an array of strings",
    });
    expect(
      sanitizeWatchListPatch({ watchedDealerSourceIds: [{ id: 1 }] }),
    ).toHaveProperty("error");
    expect(
      sanitizeWatchListPatch({
        carsState: "TX",
        watchedDealerHosts: ["a.com", "a.com"],
      }),
    ).toEqual({ patch: { carsState: "TX", watchedDealerHosts: ["a.com"] } });
  });
});
