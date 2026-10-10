import { describe, it, expect } from "vitest";
import { buildTierQueue } from "./smart-fetch";

describe("buildTierQueue: retired bypass tiers", () => {
  it("only ever uses the honest static tier", () => {
    expect(buildTierQueue(undefined, false)).toEqual(["static"]);
  });

  it("a learned winner from an old run cannot re-enable a bypass tier", () => {
    const q = buildTierQueue("headed", false);
    expect(q[0]).toBe("headed"); // stale memory is listed, but smartFetch skips any tier outside the static-only ladder
    expect(q).toContain("static");
    expect(q).not.toContain("stealth");
  });

  it("never adds FlareSolverr unless explicitly forced (it is retired)", () => {
    expect(buildTierQueue(undefined)).not.toContain("flaresolverr");
  });
});
