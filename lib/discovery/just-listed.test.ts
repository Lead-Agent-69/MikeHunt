import { describe, expect, it } from "vitest";
import {
  JUST_LISTED_WINDOW_HOURS,
  isJustListed,
  justListedRail,
} from "./just-listed";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("New to MikeHunt rail", () => {
  it("bounds on first-seen time inside the documented window", () => {
    expect(JUST_LISTED_WINDOW_HOURS).toBe(72);
    expect(isJustListed({ firstSeenAt: hoursAgo(1) }, NOW)).toBe(true);
    expect(isJustListed({ firstSeenAt: hoursAgo(71) }, NOW)).toBe(true);
    expect(isJustListed({ firstSeenAt: hoursAgo(73) }, NOW)).toBe(false);
    expect(isJustListed({ firstSeenAt: null }, NOW)).toBe(false);
    expect(isJustListed({ firstSeenAt: "nope" }, NOW)).toBe(false);
    expect(isJustListed({ firstSeenAt: hoursAgo(-5) }, NOW)).toBe(false);
  });

  it("sorts newest first-seen first and drops old rows even when recently re-seen", () => {
    const rows = [
      { id: "old-but-reseen", firstSeenAt: hoursAgo(24 * 30) },
      { id: "b", firstSeenAt: hoursAgo(10) },
      { id: "a", firstSeenAt: hoursAgo(2) },
      { id: "undated", firstSeenAt: undefined },
    ];
    const rail = justListedRail(rows, NOW, 10);
    expect(rail.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0].id).toBe("old-but-reseen");
    expect(justListedRail(rows, NOW, 1).map((r) => r.id)).toEqual(["a"]);
  });
});
