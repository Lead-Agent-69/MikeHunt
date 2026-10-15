import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  configured: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: mocks.configured,
  createServerComponentClient: mocks.client,
}));
import { GET } from "./route";
const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/retention", {
    headers: auth ? { authorization: auth } : {},
  });
const query = (result: unknown) => ({
  abortSignal: vi.fn().mockResolvedValue(result),
});
const telemetry = { data: { page_views: 3 }, error: null };
const vin = { data: [{ vin_rows: 2, recall_rows: 1 }], error: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
  mocks.configured.mockReturnValue(true);
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  process.env.CRON_SECRET = "local-test-secret";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GET /api/cron/retention", () => {
  it("denies absent, wrong and unconfigured secrets before creating a database client", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer local-test-secret"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports missing database configuration as unavailable, without RPC work", async () => {
    mocks.configured.mockReturnValue(false);
    const res = await GET(req("Bearer local-test-secret"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Supabase not configured",
    });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("runs both steps once, bounds VIN work and returns confirmed counts", async () => {
    const first = query(telemetry),
      second = query(vin);
    mocks.rpc.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const res = await GET(req("Bearer local-test-secret"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      ok: true,
      deleted: { page_views: 3 },
      vinCache: { vin_rows: 2, recall_rows: 1 },
    });
    expect(mocks.client).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "run_retention");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "purge_expired_vin_cache", {
      p_batch: 1000,
      p_max_batches: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    for (const q of [first, second])
      expect(q.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("accepts confirmed zero counts and the single-object VIN receipt", async () => {
    mocks.rpc
      .mockReturnValueOnce(query({ data: { page_views: 0 }, error: null }))
      .mockReturnValueOnce(
        query({ data: { vin_rows: 0, recall_rows: 0 }, error: null }),
      );
    expect((await GET(req("Bearer local-test-secret"))).status).toBe(200);
  });
  it.each([
    null,
    {},
    [],
    { page_views: -1 },
    { page_views: 1.5 },
    { page_views: "3" },
    { page_views: NaN },
    { private_email: 3 },
    { page_views: Number.MAX_SAFE_INTEGER + 1 },
  ])(
    "rejects unconfirmed telemetry receipt %j and skips the second step",
    async (data) => {
      mocks.rpc.mockReturnValueOnce(query({ data, error: null }));
      const res = await GET(req("Bearer local-test-secret"));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        ok: false,
        failedStep: "run_retention",
        completion: "unconfirmed",
        completedSteps: [],
        deleted: null,
        vinCache: null,
      });
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    null,
    [],
    [{ vin_rows: 1 }],
    [
      { vin_rows: 1, recall_rows: 0 },
      { vin_rows: 2, recall_rows: 0 },
    ],
    { vin_rows: -1, recall_rows: 0 },
    { vin_rows: "2", recall_rows: 0 },
    { vin_rows: 2, recall_rows: 0, extra: 1 },
  ])(
    "retains confirmed telemetry counts when VIN receipt is invalid: %j",
    async (data) => {
      mocks.rpc
        .mockReturnValueOnce(query(telemetry))
        .mockReturnValueOnce(query({ data, error: null }));
      const res = await GET(req("Bearer local-test-secret"));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        ok: false,
        failedStep: "purge_expired_vin_cache",
        completion: "unconfirmed",
        completedSteps: ["run_retention"],
        deleted: { page_views: 3 },
        vinCache: null,
      });
      expect(mocks.rpc).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["run_retention", "purge_expired_vin_cache"])(
    "sanitizes %s database failures without retrying writes",
    async (step) => {
      const privateMessage = "private SQL and bearer credential";
      if (step !== "run_retention")
        mocks.rpc.mockReturnValueOnce(query(telemetry));
      mocks.rpc.mockReturnValueOnce(
        query({ data: null, error: { message: privateMessage } }),
      );
      const res = await GET(req("Bearer local-test-secret"));
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const body = await res.json();
      expect(body).toMatchObject({
        failedStep: step,
        completion: "unconfirmed",
      });
      expect(JSON.stringify(body)).not.toContain(privateMessage);
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
        privateMessage,
      );
      expect(mocks.rpc).toHaveBeenCalledTimes(step === "run_retention" ? 1 : 2);
    },
  );
  it("handles a thrown network error after the first step without losing its receipt", async () => {
    mocks.rpc.mockReturnValueOnce(query(telemetry)).mockReturnValueOnce({
      abortSignal: vi
        .fn()
        .mockRejectedValue(new Error("private network details")),
    });
    const res = await GET(req("Bearer local-test-secret"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      deleted: { page_views: 3 },
      completedSteps: ["run_retention"],
      completion: "unconfirmed",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it.each(["run_retention", "purge_expired_vin_cache"])(
    "aborts an overdue %s request without claiming rollback or retrying writes",
    async (step) => {
      const controller = new AbortController();
      const deadline = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(controller.signal);
      const abortSignal = vi.fn(
        (signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      );
      if (step !== "run_retention")
        mocks.rpc.mockReturnValueOnce(query(telemetry));
      mocks.rpc.mockReturnValueOnce({ abortSignal });
      const pending = GET(req("Bearer local-test-secret"));
      await vi.waitFor(() => expect(abortSignal).toHaveBeenCalledTimes(1));
      controller.abort(
        new DOMException("private transport details", "TimeoutError"),
      );
      const response = await pending;
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({
        failedStep: step,
        completion: "unconfirmed",
        completedSteps: step === "run_retention" ? [] : ["run_retention"],
        deleted: step === "run_retention" ? null : { page_views: 3 },
      });
      expect(JSON.stringify(body)).not.toContain("private transport details");
      expect(deadline).toHaveBeenCalledWith(20_000);
      expect(mocks.rpc).toHaveBeenCalledTimes(step === "run_retention" ? 1 : 2);
    },
  );
});
