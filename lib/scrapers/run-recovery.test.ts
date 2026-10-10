import { describe, expect, it, vi } from "vitest";
import { isRecoveryCandidate, recoverStoppedSourceRun } from "./run-recovery";

const now = Date.parse("2026-10-08T12:00:00Z");
const run = {
  id: "run-1",
  source: "curated-dealers",
  status: "running",
  started_at: "2026-10-07T12:00:00Z",
  completed_at: null,
};

describe("abandoned source-run recovery", () => {
  it("requires old, incomplete running records with a valid date", () => {
    expect(isRecoveryCandidate(run, now)).toBe(true);
    for (const patch of [
      { status: "success" },
      { completed_at: "2026-10-07T13:00:00Z" },
      { started_at: "invalid" },
      { started_at: "2026-10-08T11:00:00Z" },
      { started_at: "2026-10-09T12:00:00Z" },
    ])
      expect(isRecoveryCandidate({ ...run, ...patch }, now)).toBe(false);
  });

  it("never writes based on age without worker-stop confirmation", async () => {
    const from = vi.fn();
    await expect(
      recoverStoppedSourceRun({ from } as any, run, false, now),
    ).rejects.toThrow("workers are stopped");
    expect(from).not.toHaveBeenCalled();
  });

  it("compares the observed state and preserves counts and history", async () => {
    const query: any = {};
    for (const key of ["update", "eq", "is", "select"])
      query[key] = vi.fn(() => query);
    query.maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: run.id }, error: null });
    const client = { from: vi.fn(() => query) } as any;
    expect(await recoverStoppedSourceRun(client, run, true, now)).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("started_at", run.started_at);
    expect(query.eq).toHaveBeenCalledWith("status", "running");
    expect(query.is).toHaveBeenCalledWith("completed_at", null);
    expect(query.update.mock.calls[0][0]).toEqual({
      status: "error",
      completed_at: new Date(now).toISOString(),
      error_message: expect.stringContaining("outcome is unknown"),
    });
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await recoverStoppedSourceRun(client, run, true, now)).toBe(false);
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "unavailable" },
    });
    await expect(
      recoverStoppedSourceRun(client, run, true, now),
    ).rejects.toThrow("unavailable");
  });
});

describe("timed-out run reaper", () => {
  it("only times out runs older than the hard limit", async () => {
    const { isTimedOutRun } = await import("./run-recovery");
    expect(isTimedOutRun(run, now)).toBe(true); // exactly 24h
    expect(
      isTimedOutRun({ ...run, started_at: "2026-10-08T00:00:00Z" }, now),
    ).toBe(false);
    expect(isTimedOutRun({ ...run, status: "success" }, now)).toBe(false);
    expect(
      isTimedOutRun({ ...run, completed_at: "2026-10-07T13:00:00Z" }, now),
    ).toBe(false);
  });

  it("marks old running runs as error in one guarded update", async () => {
    const { reapTimedOutRuns } = await import("./run-recovery");
    const calls: Array<[string, unknown]> = [];
    const chain: any = {
      update: (v: unknown) => (calls.push(["update", v]), chain),
      eq: (k: string, v: unknown) => (calls.push([`eq:${k}`, v]), chain),
      is: (k: string, v: unknown) => (calls.push([`is:${k}`, v]), chain),
      lt: (k: string, v: unknown) => (calls.push([`lt:${k}`, v]), chain),
      select: async () => ({
        data: [{ id: "a", source: "craigslist" }],
        error: null,
      }),
    };
    const supabase: any = { from: () => chain };
    expect(await reapTimedOutRuns(supabase, now)).toBe(1);
    expect(calls).toContainEqual(["eq:status", "running"]);
    expect(calls).toContainEqual(["is:completed_at", null]);
    expect(calls).toContainEqual(["lt:started_at", "2026-10-07T12:00:00.000Z"]);
    const update = calls.find(([k]) => k === "update")?.[1] as any;
    expect(update.status).toBe("error");
    expect(update.error_message).toMatch(/Timed out/);
  });
});
