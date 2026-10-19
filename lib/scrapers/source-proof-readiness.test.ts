import { describe, expect, it } from "vitest";
import {
  sourceProofReadiness,
  sourceOperationLabel,
} from "./source-proof-readiness";

const now = Date.parse("2026-10-12T01:00:00Z");
const current = "2026-10-11T01:00:00Z";
const old = "2026-10-01T01:00:00Z";
describe("source readiness requires real current proof", () => {
  it("does not show unknown rates as degraded or stale data as healthy", () => {
    expect(
      sourceOperationLabel({
        enabled: true,
        lastStatus: "running",
        successRate: null,
      }),
    ).toBe("Checking");
    expect(
      sourceOperationLabel({
        enabled: true,
        lastStatus: "observed",
        readiness: "ready",
        successRate: null,
      }),
    ).toBe("Working");
    expect(
      sourceOperationLabel({
        enabled: true,
        lastStatus: "success",
        readiness: "needs_run",
        successRate: 100,
      }),
    ).toBe("Needs refresh");
    expect(
      sourceOperationLabel({
        enabled: true,
        lastStatus: "observed",
        successRate: null,
      }),
    ).toBe("Not verified");
  });
  it("does not imply an untested or zero-row source responded", () => {
    expect(sourceProofReadiness({ enabled: true, now })).toBe("needs_run");
    expect(
      sourceProofReadiness({
        enabled: true,
        activeRows: 0,
        lastSeenAt: current,
        now,
      }),
    ).toBe("needs_run");
  });
  it.each([old, null, "invalid", "2026-10-13T01:00:00Z"])(
    "does not call stale or unverifiable inventory working: %s",
    (lastSeenAt) => {
      expect(
        sourceProofReadiness({
          enabled: true,
          activeRows: 14,
          lastSeenAt,
          now,
        }),
      ).toBe("needs_run");
    },
  );
  it("allows recent verified inventory without inventing a runner success", () => {
    expect(
      sourceProofReadiness({
        enabled: true,
        activeRows: 14,
        lastSeenAt: current,
        now,
      }),
    ).toBe("ready");
  });
  it("requires a recent successful dedicated run before claiming no matching inventory", () => {
    expect(
      sourceProofReadiness({
        enabled: true,
        lastRunStatus: "success",
        lastRunAt: current,
        now,
      }),
    ).toBe("no_rows");
    expect(
      sourceProofReadiness({
        enabled: true,
        activeRows: 14,
        lastSeenAt: old,
        lastRunStatus: "success",
        lastRunAt: current,
        now,
      }),
    ).toBe("needs_run");
    expect(
      sourceProofReadiness({
        enabled: true,
        lastRunStatus: "success",
        lastRunAt: old,
        now,
      }),
    ).toBe("needs_run");
    expect(
      sourceProofReadiness({
        enabled: true,
        sharedImporter: true,
        lastRunStatus: "success",
        lastRunAt: current,
        now,
      }),
    ).toBe("needs_run");
  });
  it("preserves permission, connection and latest failure gates", () => {
    expect(
      sourceProofReadiness({
        enabled: true,
        termsOff: true,
        activeRows: 14,
        lastSeenAt: current,
        now,
      }),
    ).toBe("disabled");
    expect(
      sourceProofReadiness({ enabled: false, requiresAuth: true, now }),
    ).toBe("needs_login");
    expect(
      sourceProofReadiness({
        enabled: true,
        lastRunStatus: "error",
        activeRows: 14,
        lastSeenAt: current,
        now,
      }),
    ).toBe("blocked");
  });
});
