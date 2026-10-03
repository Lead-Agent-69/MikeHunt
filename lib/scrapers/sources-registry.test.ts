import { describe, expect, it } from "vitest";
import {
  ALL_SOURCES,
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
