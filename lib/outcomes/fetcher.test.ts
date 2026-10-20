import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerOutcomeFetcher } from "./fetcher";
afterEach(() => vi.unstubAllGlobals());
describe("owner-scoped outcome reads", () => {
  it("accepts only a response for the requested account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ownerId: "one", outcomes: [] })),
    );
    await expect(
      ownerOutcomeFetcher(["/api/outcomes", "one"]),
    ).resolves.toMatchObject({ outcomes: [] });
    await expect(ownerOutcomeFetcher(["/api/outcomes", "two"])).rejects.toThrow(
      "account or connection changed",
    );
  });
  it("rejects missing ownership and unavailable history instead of caching an empty success", async () => {
    for (const body of [
      { outcomes: [] },
      { ownerId: "one", configured: false },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body)),
      );
      await expect(
        ownerOutcomeFetcher(["/api/outcomes", "one"]),
      ).rejects.toThrow();
    }
  });
  it("does not consume or cache a failed response", async () => {
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json })),
    );
    await expect(ownerOutcomeFetcher(["/api/outcomes", "one"])).rejects.toThrow(
      "could not be loaded",
    );
    expect(json).not.toHaveBeenCalled();
  });
});
