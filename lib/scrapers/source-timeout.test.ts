import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCE_TIMEOUT_MS,
  REFRESH_SOURCE_TIMEOUT_MS,
  sourceTimeoutMs,
} from "./source-timeout";

describe("per-source collection deadline", () => {
  it("keeps buyer searches bounded and gives operator refreshes time to persist", () => {
    expect(sourceTimeoutMs({ state: "MO" })).toBe(DEFAULT_SOURCE_TIMEOUT_MS);
    expect(sourceTimeoutMs({ state: "MO", refreshExisting: true })).toBe(
      REFRESH_SOURCE_TIMEOUT_MS,
    );
  });
});
