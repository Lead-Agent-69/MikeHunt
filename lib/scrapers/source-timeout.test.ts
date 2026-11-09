import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCE_TIMEOUT_MS,
  REFRESH_SOURCE_TIMEOUT_MS,
  TARGETED_DEALER_TIMEOUT_MS,
  sourceTimeoutMs,
} from "./source-timeout";

describe("per-source collection deadline", () => {
  it("keeps buyer searches bounded and gives operator refreshes time to persist", () => {
    expect(sourceTimeoutMs({ state: "MO" })).toBe(DEFAULT_SOURCE_TIMEOUT_MS);
    expect(sourceTimeoutMs({ state: "MO", refreshExisting: true })).toBe(
      REFRESH_SOURCE_TIMEOUT_MS,
    );
  });

  it("allows a paced detail walk only when a run targets one curated dealer", () => {
    const scope = { dealerHosts: ["highway12autosales.com"] };
    expect(sourceTimeoutMs(scope, ["curated_dealers"])).toBe(
      TARGETED_DEALER_TIMEOUT_MS,
    );
    expect(sourceTimeoutMs(scope, ["curated_dealers", "govdeals"])).toBe(
      DEFAULT_SOURCE_TIMEOUT_MS,
    );
    expect(
      sourceTimeoutMs({ ...scope, dealerSourceIds: ["legacy-motors-joplin"] }, [
        "curated_dealers",
      ]),
    ).toBe(DEFAULT_SOURCE_TIMEOUT_MS);
  });
});
