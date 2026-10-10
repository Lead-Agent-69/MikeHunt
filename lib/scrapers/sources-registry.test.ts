import { describe, expect, it } from "vitest";
import {
  ALL_SOURCES,
  MULTISITE_LINK_SOURCES,
  OPEN_GOV_FEEDS,
  RESEARCHED_DEALER_STATES,
  STATE_DEALER_CANDIDATES,
} from "./sources-registry";

describe("researched 50-state dealer coverage", () => {
  it("keeps a researched dealer starting point for every state", () => {
    expect(RESEARCHED_DEALER_STATES).toHaveLength(50);
    expect(new Set(RESEARCHED_DEALER_STATES)).toHaveLength(50);
    expect(RESEARCHED_DEALER_STATES).toContain("FL");
    expect(RESEARCHED_DEALER_STATES).toContain("WY");
  });

  it("keeps candidates catalog-only until their source review is complete", () => {
    expect(STATE_DEALER_CANDIDATES.length).toBeGreaterThan(40);
    expect(
      STATE_DEALER_CANDIDATES.every(
        (candidate) =>
          candidate.status === "planned" &&
          candidate.priority === "P3" &&
          candidate.states?.length === 1,
      ),
    ).toBe(true);
  });

  it("does not introduce duplicate catalog identities", () => {
    const ids = ALL_SOURCES.map((source) => source.id);
    expect(new Set(ids)).toHaveLength(ids.length);
  });
});

describe("open government vehicle feeds", () => {
  it("are registered as no-auth open-data sources with a state, format and license", () => {
    expect(OPEN_GOV_FEEDS.length).toBeGreaterThanOrEqual(10);
    for (const s of OPEN_GOV_FEEDS) {
      expect(s.access).toBe("open-data");
      expect(s.authRequired).toBe("none");
      expect(s.states?.length).toBeGreaterThan(0);
      expect(s.format).toBeTruthy();
      expect(s.license).toBeTruthy();
      expect(ALL_SOURCES).toContain(s);
    }
  });

  it("cover the thin states Elle found open lists for", () => {
    const states = new Set(OPEN_GOV_FEEDS.flatMap((s) => s.states ?? []));
    for (const st of ["MD", "HI", "DE", "TN", "WA", "WV", "MA"]) expect(states.has(st)).toBe(true);
  });

  it("never point at gated auction storefronts", () => {
    for (const s of OPEN_GOV_FEEDS)
      expect(s.url).not.toMatch(/govdeals|publicsurplus|copart|iaai|assetworks|recoup/i);
  });
});

describe("multi-site link sources", () => {
  it("are link-only and never Carvana or Visor", () => {
    for (const s of MULTISITE_LINK_SOURCES) {
      expect(s.access).toBe("link-only");
      expect(s.url).not.toMatch(/carvana|visor/i);
      expect(ALL_SOURCES).toContain(s);
    }
  });
});
