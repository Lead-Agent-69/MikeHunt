import { afterEach, expect, it, vi } from "vitest";
import { cached, invalidate } from "./cache";
afterEach(() => {
  invalidate();
  vi.useRealTimers();
});
it("bounds full-inventory caches without evicting other namespaces", async () => {
  const limits = { prefix: "market:", maxEntries: 2 };
  await cached("account:1", 1000, async () => 7);
  await cached("market:a", 1000, async () => 1, undefined, limits);
  await cached("market:b", 1000, async () => 2, undefined, limits);
  await cached("market:c", 1000, async () => 3, undefined, limits);
  expect(
    await cached("market:b", 1000, async () => 99, undefined, limits),
  ).toBe(2);
  expect(await cached("market:a", 1000, async () => 9, undefined, limits)).toBe(
    9,
  );
  expect(await cached("account:1", 1000, async () => 99)).toBe(7);
});
it("shares concurrent reads but not different scope keys", async () => {
  let resolve!: (value: number) => void;
  const load = vi.fn(
    () =>
      new Promise<number>((r) => {
        resolve = r;
      }),
  );
  const a = cached("MO", 1000, load);
  const b = cached("MO", 1000, load);
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  expect(await cached("IL", 1000, async () => 9)).toBe(9);
  resolve(3);
  expect(await a).toBe(3);
  expect(await b).toBe(3);
});
it("does not cache failures and retries normally", async () => {
  await expect(
    cached("status", 1000, async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(await cached("status", 1000, async () => 7)).toBe(7);
});
it("invalidation prevents an older response overwriting a new one", async () => {
  let resolve!: (value: number) => void;
  const old = cached(
    "feed:MO",
    1000,
    () =>
      new Promise<number>((r) => {
        resolve = r;
      }),
  );
  await Promise.resolve();
  invalidate("feed:");
  expect(await cached("feed:MO", 1000, async () => 2)).toBe(2);
  resolve(1);
  await old;
  expect(await cached("feed:MO", 1000, async () => 99)).toBe(2);
});
