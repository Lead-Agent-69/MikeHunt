import { describe, expect, it, vi } from "vitest";
import {
  callSignal,
  createDeadline,
  UPSTREAM_CALL_TIMEOUT_MS,
} from "./deadline";
import { decodeVinExtended, getRecalls } from "./nhtsa";

describe("upstream deadline", () => {
  it("every call gets a signal, bounded by the per-call timeout", () => {
    expect(UPSTREAM_CALL_TIMEOUT_MS).toBe(10_000);
    const s = callSignal();
    expect(s).toBeInstanceOf(AbortSignal);
    expect(s.aborted).toBe(false);
  });

  it("an expired deadline skips every upstream call", async () => {
    let t = 0;
    const deadline = createDeadline(1000, () => t);
    t = 2000;
    expect(deadline.expired()).toBe(true);
    const f = vi.fn();
    expect(
      await decodeVinExtended("1FT7W2BT8GED11804", f as any, { deadline }),
    ).toBeNull();
    expect(
      await getRecalls("FORD", "F-250", 2016, f as any, { deadline }),
    ).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("passes an AbortSignal to each fetch", async () => {
    const f = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return { ok: false, json: async () => ({}) };
    });
    await decodeVinExtended("1FT7W2BT8GED11804", f as any, {
      deadline: createDeadline(),
    });
    await getRecalls("FORD", "F-250", 2016, f as any, {
      deadline: createDeadline(),
    });
    expect(f).toHaveBeenCalled();
  });

  it("recalls stop and report unknown (not a low count) when the deadline runs out mid-loop", async () => {
    let t = 0;
    const deadline = createDeadline(1000, () => t);
    const f = vi.fn(async (url: string) => {
      if (url.includes("products/vehicle/models"))
        return {
          ok: true,
          json: async () => ({
            results: [{ model: "F-250" }, { model: "F-250 SD" }],
          }),
        };
      t = 5000; // first recall call burns the budget
      return { ok: true, json: async () => ({ Count: 0, results: [] }) };
    });
    expect(
      await getRecalls("FORD", "F-250", 2016, f as any, { deadline }),
    ).toBeNull();
  });
});
