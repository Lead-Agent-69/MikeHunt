import { afterEach, describe, expect, it, vi } from "vitest";
import { startScopedJobHeartbeat } from "./job-heartbeat";

afterEach(() => vi.useRealTimers());

describe("scoped job heartbeat", () => {
  it("updates only its own running job and stops on cleanup", async () => {
    vi.useFakeTimers();
    const query: any = { update: vi.fn(() => query), eq: vi.fn(() => query) };
    query.then = (resolve: any) =>
      Promise.resolve({ error: null }).then(resolve);
    const from = vi.fn(() => query);
    const stop = startScopedJobHeartbeat(
      { from } as any,
      "job-1",
      "worker-1",
      vi.fn(),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(query.eq).toHaveBeenCalledWith("id", "job-1");
    expect(query.eq).toHaveBeenCalledWith("worker_id", "worker-1");
    expect(query.eq).toHaveBeenCalledWith("status", "running");
    expect(query.update).toHaveBeenCalledWith({
      heartbeat_at: expect.any(String),
    });
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("reports a failed heartbeat without treating it as successful collection", async () => {
    vi.useFakeTimers();
    const query: any = { update: () => query, eq: () => query };
    query.then = (resolve: any) =>
      Promise.resolve({ error: "queue unavailable" }).then(resolve);
    const onError = vi.fn();
    const stop = startScopedJobHeartbeat(
      { from: () => query } as any,
      "job",
      "worker",
      onError,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onError).toHaveBeenCalledWith("queue unavailable");
    stop();
  });
});
