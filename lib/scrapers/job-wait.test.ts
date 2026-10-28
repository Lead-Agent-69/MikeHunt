import { describe, expect, it } from "vitest";
import {
  dailyCapacityWait,
  publicCapacityWait,
  storageCapacityWait,
} from "./job-wait";
import { sourceSearchStatusMessage } from "./job-status-client";

const now = Date.parse("2026-10-21T23:50:00Z");

describe("dated capacity observations", () => {
  it("uses a short capacity recheck for storage holds without promising that midnight will release them", () => {
    const waiting = storageCapacityWait(now);
    expect(waiting.nextCheckAt).toBe("2026-10-21T23:55:00.000Z");
    expect(publicCapacityWait("pending", { waiting }, now)).toEqual(waiting);
    const message = sourceSearchStatusMessage(
      { id: "a", status: "pending", waiting },
      now,
    );
    expect(message).toContain("temporarily paused");
    expect(message).not.toContain("next daily collection allowance");
    expect(message).toContain("not a finish time");
    expect(
      publicCapacityWait("pending", { waiting }, now + 5 * 60_000),
    ).toBeNull();
    expect(publicCapacityWait("running", { waiting }, now)).toBeNull();
    expect(
      publicCapacityWait(
        "pending",
        {
          waiting: {
            ...waiting,
            nextCheckAt: dailyCapacityWait(now).nextCheckAt,
          },
        },
        now,
      ),
    ).toBeNull();
  });
  it("uses the collector's UTC rollover without implying completion", () => {
    const waiting = dailyCapacityWait(now);
    expect(waiting.nextCheckAt).toBe("2026-10-22T00:00:00.000Z");
    expect(publicCapacityWait("pending", { waiting }, now)).toEqual(waiting);
    const message = sourceSearchStatusMessage(
      { id: "a", status: "pending", waiting },
      now,
    );
    expect(message).toContain("At the last check");
    expect(message).toContain("not a finish time");
    expect(message).toContain("Existing matches remain available");
  });

  it("expires at rollover and ignores notices after a job starts or finishes", () => {
    const waiting = dailyCapacityWait(now);
    expect(
      publicCapacityWait(
        "pending",
        { waiting },
        Date.parse(waiting.nextCheckAt),
      ),
    ).toBeNull();
    for (const status of ["running", "completed", "failed"])
      expect(publicCapacityWait(status, { waiting }, now)).toBeNull();
  });

  it.each([
    null,
    { waiting: "secret provider error" },
    { waiting: { reason: "unknown" } },
    { waiting: { ...dailyCapacityWait(now), observedAt: "invalid" } },
    { waiting: dailyCapacityWait(now + 1) },
    { waiting: { ...dailyCapacityWait(now), nextCheckAt: "2027-01-01" } },
  ])("fails closed on malformed or future observations %j", (result) => {
    expect(publicCapacityWait("pending", result, now)).toBeNull();
  });

  it("returns only public fields, not raw metadata", () => {
    expect(
      publicCapacityWait(
        "pending",
        { waiting: { ...dailyCapacityWait(now), token: "secret" } },
        now,
      ),
    ).toEqual(dailyCapacityWait(now));
  });
});
