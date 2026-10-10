import { afterEach, expect, it, vi } from "vitest";
import { cached, invalidate } from "./cache";
afterEach(() => {
  vi.unstubAllEnvs();
  invalidate();
});
it("does not reuse inventory after a permission change in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const load = vi
    .fn()
    .mockResolvedValueOnce(["approved"])
    .mockResolvedValueOnce([]);
  expect(await cached("discover", 60000, load)).toEqual(["approved"]);
  expect(await cached("discover", 60000, load)).toEqual([]);
});
