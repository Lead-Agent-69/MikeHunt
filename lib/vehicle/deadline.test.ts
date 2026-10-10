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

describe("readJsonCapped (1 MB upstream cap)", () => {
  it("refuses an oversize body by Content-Length", async () => {
    const { readJsonCapped, UPSTREAM_MAX_BYTES } = await import("./deadline");
    expect(UPSTREAM_MAX_BYTES).toBe(1024 * 1024);
    await expect(
      readJsonCapped(
        new Response("{}", {
          headers: { "content-length": String(UPSTREAM_MAX_BYTES + 1) },
        }),
      ),
    ).rejects.toThrow();
  });
  it("cancels a streamed body once it passes the cap", async () => {
    const { readJsonCapped } = await import("./deadline");
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++;
        if (pulls > 100) c.close();
        else c.enqueue(new Uint8Array(1024));
      },
    });
    await expect(readJsonCapped(new Response(stream), 4096)).rejects.toThrow();
    expect(pulls).toBeLessThan(10);
  });
  it("parses a normal body", async () => {
    const { readJsonCapped } = await import("./deadline");
    expect(await readJsonCapped(new Response('{"a":1}'))).toEqual({ a: 1 });
  });
});
