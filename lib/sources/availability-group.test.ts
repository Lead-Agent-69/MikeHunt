import { describe, expect, it } from "vitest";
import { sourceAvailabilityGroup } from "./availability-group";

describe("complete source availability groups", () => {
  it("keeps policy, setup and unknown states visible as unavailable", () => {
    for (const state of [
      "disabled",
      "not_configured",
      "blocked",
      "future_state",
      null,
      undefined,
    ])
      expect(sourceAvailabilityGroup(state)).toBe("blocked");
  });
  it("partitions mixed coverage without losing or double-counting any source", () => {
    const states = [
      "ready",
      "disabled",
      "needs_login",
      "needs_run",
      "no_rows",
      "not_configured",
    ];
    const groups = states.map(sourceAvailabilityGroup);
    expect(groups.filter((g) => g === "blocked")).toHaveLength(2);
    expect(groups.filter((g) => g !== "ready")).toHaveLength(5);
    expect(groups.filter((g) => g === "ready")).toHaveLength(1);
    expect(groups).toHaveLength(states.length);
  });
});
