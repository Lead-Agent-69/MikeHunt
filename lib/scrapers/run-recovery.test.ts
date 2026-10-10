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
