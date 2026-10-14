import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const maintain = vi.hoisted(() => vi.fn());
vi.mock("./photo-maintenance", () => ({ maintainListingPhotos: maintain }));
import { LocalScraperCache } from "./local-cache";
const dirs: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function cache(options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "photo-maintenance-"));
  dirs.push(dir);
  const c = new LocalScraperCache({ path: dir, ...options });
  await c.load();
  return { c, dir };
}
it("persists cadence across restart, rotates demand states, and uses the existing update budget", async () => {
  const { c, dir } = await cache({ maxDailyUpdates: 5 });
  maintain.mockImplementation(async (_sb, opts) => {
    for (let i = 0; i < opts.limit; i++)
      await opts.onWrite({ source: "dealer", source_deal_id: String(i) });
    return { checked: opts.limit, written: opts.limit, state: opts.state };
  });
  expect(
    await c.verifyListingPhotos({} as any, ["TX", "MO", "invalid"]),
  ).toMatchObject({ state: "MO", written: 4 });
  expect(c.getQuota().updates).toBe(4);
  const reloaded = new LocalScraperCache({ path: dir, maxDailyUpdates: 5 });
  await reloaded.load();
  expect(await reloaded.verifyListingPhotos({} as any, ["TX"])).toBeNull();
  expect(maintain).toHaveBeenCalledTimes(1);
  expect(maintain.mock.calls[0][1].limit).toBe(4);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600_001);
  expect(reloaded.photoChecksDue()).toBe(false);
  expect(await reloaded.verifyListingPhotos({} as any, ["TX"])).toBeNull();
  expect(maintain).toHaveBeenCalledTimes(1);
});
it("rotates to a selected state after an hour, without repeat work every queue poll", async () => {
  const { c, dir } = await cache();
  maintain.mockImplementation(async (_sb, opts) => ({
    state: opts.state,
    checked: 0,
    written: 0,
  }));
  await c.verifyListingPhotos({} as any, ["TX"]);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600_001);
  const reloaded = new LocalScraperCache({ path: dir });
  await reloaded.load();
  expect(await reloaded.verifyListingPhotos({} as any, ["TX"])).toMatchObject({
    state: "TX",
  });
  vi.restoreAllMocks();
});
it("performs no photo requests in cache-only or paused mode", async () => {
  for (const opts of [
    { cacheOnly: true },
    { beforeWrite: async () => false },
  ]) {
    const { c } = await cache(opts);
    expect(await c.verifyListingPhotos({} as any)).toBeNull();
  }
  expect(maintain).not.toHaveBeenCalled();
});

it("does not retry failed maintenance every poll or reset its cadence after restart", async () => {
  const { c, dir } = await cache();
  maintain.mockRejectedValueOnce(new Error("network failed"));
  await expect(c.verifyListingPhotos({} as any)).rejects.toThrow(
    "network failed",
  );
  expect(c.getQuota().updates).toBe(0);
  const restarted = new LocalScraperCache({ path: dir });
  await restarted.load();
  expect(restarted.photoChecksDue()).toBe(false);
  expect(await restarted.verifyListingPhotos({} as any)).toBeNull();
  expect(maintain).toHaveBeenCalledTimes(1);
});
