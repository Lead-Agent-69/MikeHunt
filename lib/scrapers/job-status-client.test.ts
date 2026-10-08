import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pollScopedScrapeJob,
  sourceSearchStatusMessage,
} from "./job-status-client";

describe("scoped search monitoring", () => {
  const id = "search-1";
  let fetchMock: ReturnType<typeof vi.fn>;
  const response = (status: string, result: unknown = null) => ({
    ok: true,
    status: 200,
    json: async () => ({ job: { id, status, result } }),
  });
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const poll = (
    signal = new AbortController().signal,
    update = vi.fn(),
    timeoutMs = 1000,
  ) => pollScopedScrapeJob(id, signal, update, { intervalMs: 10, timeoutMs });

  it("returns only the actual completed result after active states", async () => {
    const result = { total: 2, successful: 1, totalDeals: 0 };
    fetchMock
      .mockResolvedValueOnce(response("pending"))
      .mockResolvedValueOnce(response("running"))
      .mockResolvedValueOnce(response("completed", result));
    const update = vi.fn();
    const task = poll(undefined, update);
    await vi.advanceTimersByTimeAsync(25);
    expect((await task)?.result).toEqual(result);
    expect(update).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });

  it("never invents a successful summary when completion has none", async () => {
    fetchMock.mockResolvedValue(response("completed"));
    expect((await poll())?.result).toBeNull();
  });

  it("does not expose provider errors or return success on failure", async () => {
    fetchMock.mockResolvedValue({
      ...response("failed"),
      json: async () => ({
        job: { id, status: "failed", error_message: "secret runner detail" },
      }),
    });
    await expect(poll()).rejects.toThrow("couldn't check the selected sources");
  });

  it.each([401, 404])(
    "does not retry account/access failures (%s)",
    async (status) => {
      fetchMock.mockResolvedValue({ ok: false, status });
      await expect(poll()).rejects.toThrow(
        status === 401 ? "Sign in again" : "no longer available",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects a response for another search", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job: { id: "other", status: "completed" } }),
    });
    await expect(poll()).rejects.toThrow("couldn't verify");
  });

  it("recovers a transient connection loss without resubmitting collection", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("internal connection detail"))
      .mockResolvedValueOnce(response("completed", { totalDeals: 1 }));
    const update = vi.fn();
    const task = poll(undefined, update);
    await vi.advanceTimersByTimeAsync(15);
    expect((await task)?.status).toBe("completed");
    expect(update).toHaveBeenCalledWith(
      expect.stringContaining("no duplicate search"),
    );
  });

  it("ends repeated connection failures with friendly guidance", async () => {
    fetchMock.mockRejectedValue(new Error("internal connection detail"));
    const assertion = expect(poll()).rejects.toThrow("lost the connection");
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops waiting at the deadline without claiming completion", async () => {
    fetchMock.mockResolvedValue(response("running"));
    const task = poll(undefined, undefined, 25);
    await vi.advanceTimersByTimeAsync(30);
    expect(await task).toBeNull();
  });

  it("cancels between requests and does not deliver stale success", async () => {
    fetchMock.mockResolvedValue(response("running"));
    const controller = new AbortController();
    const update = vi.fn();
    const assertion = expect(
      poll(controller.signal, update),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects late completion after navigation, even if fetch ignores cancellation", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const controller = new AbortController();
    const update = vi.fn();
    const assertion = expect(
      poll(controller.signal, update),
    ).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    resolve(response("completed"));
    await assertion;
    expect(update).not.toHaveBeenCalled();
  });

  it("does not start a request when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(poll(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns about stale heartbeat without asserting job failure", () => {
    const now = Date.now();
    expect(
      sourceSearchStatusMessage(
        {
          id,
          status: "running",
          heartbeat_at: new Date(now - 360_000).toISOString(),
        },
        now,
      ),
    ).toContain("can't confirm");
    expect(
      sourceSearchStatusMessage(
        { id, status: "running", heartbeat_at: new Date(now).toISOString() },
        now,
      ),
    ).toContain("Checking your selected");
    expect(sourceSearchStatusMessage({ id, status: "pending" }, now)).toContain(
      "waiting to begin",
    );
  });
});
