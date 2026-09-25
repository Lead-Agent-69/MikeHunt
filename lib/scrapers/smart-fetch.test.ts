import { describe, it, expect } from "vitest";
import { buildTierQueue } from "./smart-fetch";

describe("buildTierQueue — the arsenal order", () => {
  it("climbs the in-house ladder cheap→powerful when nothing is learned", () => {
    expect(buildTierQueue(undefined, false)).toEqual([
      "static",
      "stealth",
      "headed",
    ]);
  });

  it("tries the learned winner first, then the rest of the ladder", () => {
    expect(buildTierQueue("headed", false)).toEqual([
      "headed",
      "static",
      "stealth",
    ]);
  });

  it("appends FlareSolverr as the LAST resort when it's configured", () => {
    expect(buildTierQueue(undefined, true)).toEqual([
      "static",
      "stealth",
      "headed",
      "flaresolverr",
    ]);
  });

  it("never duplicates FlareSolverr when it's already the learned winner", () => {
    const q = buildTierQueue("flaresolverr", true);
    expect(q.filter((t) => t === "flaresolverr")).toHaveLength(1);
    expect(q[0]).toBe("flaresolverr"); // learned winner goes first
  });

  it("omits FlareSolverr entirely when unconfigured (no wasted reserve)", () => {
    expect(buildTierQueue(undefined, false)).not.toContain("flaresolverr");
  });
});
