import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStorageBudgetChecker,
  storageInsertAllowance,
  storageWriteQuota,
} from "./storage-budget";
import { writeCapacity } from "./write-capacity";
afterEach(() => vi.useRealTimers());
const result = (value: unknown) => ({
  abortSignal: vi.fn().mockResolvedValue(value),
});
describe("database size budget", () => {
  const quota = {
    inserts: 400,
    updates: 100,
    touches: 10,
    maxInserts: 1250,
    maxUpdates: 2000,
    maxTouches: 20000,
  };
  it("holds buyer intake at the storage allowance while keeping existing inventory refreshable", () => {
    const budget = {
      bytes: 372_000_000,
      state: "warning",
      allowInsert: true,
    } as const;
    expect(writeCapacity(quota).insertsRemaining).toBe(600);
    const effective = storageWriteQuota(quota, budget);
    expect(effective.maxInserts).toBe(500);
    expect(writeCapacity(effective)).toMatchObject({
      insertsRemaining: 0,
      updatesRemaining: 1500,
      touchesRemaining: 19990,
      mode: "refresh_only",
      paused: false,
    });
    expect(storageInsertAllowance(budget, quota).remaining).toBe(
      writeCapacity(effective).insertsRemaining,
    );
    expect(
      writeCapacity(storageWriteQuota({ ...quota, inserts: 0 }, budget))
        .insertsRemaining,
    ).toBe(400);
  });
  it("fails closed before a size check and during critical/unknown storage without blocking refresh budgets", () => {
    for (const budget of [
      undefined,
      { bytes: null, state: "unknown", allowInsert: false } as const,
      { bytes: 451_000_000, state: "critical", allowInsert: false } as const,
    ]) {
      expect(writeCapacity(storageWriteQuota(quota, budget))).toMatchObject({
        insertsRemaining: 0,
        updatesRemaining: 1500,
        mode: "refresh_only",
      });
    }
    expect(
      writeCapacity(
        storageWriteQuota(quota, {
          bytes: 349_000_000,
          state: "normal",
          allowInsert: true,
        }),
      ).insertsRemaining,
    ).toBe(600);
  });
  it("never expands configured intake or permits malformed/fractional counters to bypass the guard", () => {
    const budget = {
      bytes: 372_000_000,
      state: "warning",
      allowInsert: true,
    } as const;
    expect(
      storageWriteQuota({ ...quota, inserts: 0, maxInserts: 20 }, budget)
        .maxInserts,
    ).toBe(20);
    expect(
      storageInsertAllowance(budget, { inserts: 399.1, maxInserts: 1250 })
        .remaining,
    ).toBe(0);
    for (const invalid of [NaN, Infinity, -1]) {
      expect(
        storageInsertAllowance(budget, { inserts: invalid, maxInserts: 1250 })
          .allowed,
      ).toBe(false);
    }
    expect(
      storageInsertAllowance(budget, { inserts: 0, maxInserts: NaN }).allowed,
    ).toBe(false);
    expect(
      storageInsertAllowance(budget, { inserts: 0, maxInserts: 1250 }, NaN)
        .allowed,
    ).toBe(false);
  });
  it("uses full normal capacity, slows at warning, and fails closed", () => {
    const quota = { inserts: 399, maxInserts: 1250 };
    expect(
      storageInsertAllowance(
        { bytes: 349_000_000, state: "normal", allowInsert: true },
        quota,
      ),
    ).toEqual({ dailyLimit: 1250, remaining: 601, allowed: true });
    expect(
      storageInsertAllowance(
        { bytes: 350_000_000, state: "warning", allowInsert: true },
        quota,
      ),
    ).toEqual({ dailyLimit: 500, remaining: 1, allowed: true });
    expect(
      storageInsertAllowance(
        { bytes: 350_000_000, state: "warning", allowInsert: true },
        { ...quota, inserts: 400 },
      ).allowed,
    ).toBe(false);
    expect(
      storageInsertAllowance(
        { bytes: 450_000_000, state: "critical", allowInsert: false },
        quota,
      ).allowed,
    ).toBe(false);
  });
  it("warns at 350 MB and stops new inserts at 450 MB", async () => {
    for (const [bytes, state, allowInsert] of [
      [349_000_000, "normal", true],
      [350_000_000, "warning", true],
      [450_000_000, "critical", false],
    ] as const) {
      const rpc = vi
        .fn()
        .mockReturnValue(result({ data: String(bytes), error: null }));
      expect(await createStorageBudgetChecker()({ rpc } as any)).toEqual({
        bytes,
        state,
        allowInsert,
      });
    }
  });
  it("fails closed on missing RPC/errors/malformed measurements", async () => {
    for (const response of [
      { data: null, error: null },
      { data: {}, error: null },
      { data: 0.5, error: null },
      { data: "12.5", error: null },
      { data: 64, error: { message: "denied" } },
    ]) {
      expect(
        (
          await createStorageBudgetChecker()({
            rpc: vi.fn().mockReturnValue(result(response)),
          } as any)
        ).allowInsert,
      ).toBe(false);
    }
  });
  it("caches successful measurements and retries failed ones sooner", async () => {
    let now = 0;
    const check = createStorageBudgetChecker(() => now);
    const rpc = vi
      .fn()
      .mockReturnValueOnce(result({ data: null, error: {} }))
      .mockReturnValue(result({ data: 100_000_000, error: null }));
    const client = { rpc } as any;
    await check(client);
    await check(client);
    expect(rpc).toHaveBeenCalledTimes(1);
    now = 60_000;
    expect((await check(client)).allowInsert).toBe(true);
    now = 120_000;
    await check(client);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("fails closed after five seconds even if a transport ignores abort, then recovers", async () => {
    vi.useFakeTimers();
    let now = 0;
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const abortSignal = vi.fn().mockReturnValue(pending);
    const rpc = vi
      .fn()
      .mockReturnValueOnce({ abortSignal })
      .mockReturnValue(result({ data: 100_000_000, error: null }));
    const check = createStorageBudgetChecker(() => now);
    const first = check({ rpc } as any);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await first).toEqual({
      bytes: null,
      state: "unknown",
      allowInsert: false,
    });
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true);
    expect((await check({ rpc } as any)).allowInsert).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    now = 60_000;
    expect((await check({ rpc } as any)).allowInsert).toBe(true);
    finish({ data: 490_000_000, error: null });
    await Promise.resolve();
    expect((await check({ rpc } as any)).bytes).toBe(100_000_000);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
