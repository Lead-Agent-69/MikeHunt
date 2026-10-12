import { describe, expect, it, vi } from "vitest";
import { createStorageBudgetChecker } from "./storage-budget";
describe("database size budget", () => {
  it("warns at 350 MB and stops new inserts at 450 MB", async () => {
    for (const [bytes, state, allowInsert] of [
      [349_000_000, "normal", true],
      [350_000_000, "warning", true],
      [450_000_000, "critical", false],
    ] as const) {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: String(bytes), error: null });
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
            rpc: vi.fn().mockResolvedValue(response),
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
      .mockResolvedValueOnce({ data: null, error: {} })
      .mockResolvedValue({ data: 100_000_000, error: null });
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
});
