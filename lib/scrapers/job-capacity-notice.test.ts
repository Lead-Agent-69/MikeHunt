import { describe, expect, it, vi } from "vitest";
import { recordPendingCapacityWait } from "./job-capacity-notice";

const quota = {
  inserts: 400,
  updates: 749,
  touches: 0,
  maxInserts: 500,
  maxUpdates: 750,
  maxTouches: 20000,
};

function query(result: unknown) {
  const api: Record<string, any> = {};
  for (const method of [
    "select",
    "eq",
    "is",
    "not",
    "order",
    "limit",
    "update",
    "in",
  ])
    api[method] = vi.fn(() => api);
  api.abortSignal = vi.fn(async () => result);
  return api;
}

describe("capacity notice publication", () => {
  it("does not query when new matches can be published", async () => {
    const from = vi.fn();
    expect(
      await recordPendingCapacityWait({ from } as any, {
        ...quota,
        inserts: 0,
      }),
    ).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("bounds work, excludes maintenance/dry runs and guards against concurrent claims/results", async () => {
    const read = query({ data: [{ id: "a" }], error: null });
    const write = query({ data: [], error: null });
    const from = vi.fn().mockReturnValueOnce(read).mockReturnValueOnce(write);
    expect(
      await recordPendingCapacityWait(
        { from } as any,
        quota,
        Date.parse("2026-10-21T12:00:00Z"),
      ),
    ).toBe(0);
    expect(read.select).toHaveBeenCalledWith("id");
    expect(read.eq).toHaveBeenCalledWith("dry_run", false);
    expect(read.not).toHaveBeenCalledWith(
      "scope",
      "cs",
      '{"refreshExisting":true}',
    );
    expect(read.limit).toHaveBeenCalledWith(10);
    expect(write.in).toHaveBeenCalledWith("id", ["a"]);
    expect(write.eq).toHaveBeenCalledWith("status", "pending");
    expect(write.is).toHaveBeenCalledWith("result", null);
    expect(write.update).toHaveBeenCalledWith({
      result: {
        waiting: {
          reason: "daily_capacity",
          observedAt: "2026-10-21T12:00:00.000Z",
          nextCheckAt: "2026-10-22T00:00:00.000Z",
        },
      },
    });
  });

  it("does not write when the queue is empty", async () => {
    const from = vi.fn(() => query({ data: [], error: null }));
    expect(await recordPendingCapacityWait({ from } as any, quota)).toBe(0);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("does not expose provider errors", async () => {
    const from = vi.fn(() =>
      query({ data: null, error: { message: "secret" } }),
    );
    await expect(
      recordPendingCapacityWait({ from } as any, quota),
    ).rejects.toThrow("Could not record search waiting status.");
  });
});
