import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateInventoryViews,
  ownerInventoryFetcher,
  writeInventory,
} from "./account-client";

const cache = vi.hoisted(() => ({
  mutate: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
}));
vi.mock("swr", () => ({ mutate: cache.mutate }));
afterEach(() => {
  vi.unstubAllGlobals();
  cache.mutate.mockClear();
});
const item = { id: "unit", dealerId: "one", stage: "recon" };

describe("inventory account confirmation", () => {
  it("loads only the expected owner's rows with bounded uncached requests", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ownerId: "one", items: [item] }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(
      (await ownerInventoryFetcher(["/api/inventory", "one"])).items,
    ).toEqual([item]);
    expect(fetch.mock.calls[0]).toMatchObject([
      "/api/inventory",
      {
        headers: { "x-inventory-owner": "one" },
        cache: "no-store",
        signal: expect.any(AbortSignal),
      },
    ]);
  });
  it.each([
    { ownerId: "two", items: [item] },
    { ownerId: "one", items: [{ ...item, dealerId: "two" }] },
    { ownerId: "one", items: [null] },
    { ownerId: "one", items: [], configured: false },
    { items: [] },
  ])("rejects stale or incomplete inventory responses %j", async (result) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(result)),
    );
    await expect(
      ownerInventoryFetcher(["/api/inventory", "one"]),
    ).rejects.toThrow();
  });
  it("does not convert failed reads into empty inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [] }, { status: 401 })),
    );
    await expect(
      ownerInventoryFetcher(["/api/inventory", "one"]),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("sends the submitting owner and accepts only its confirmed mutation", async () => {
    const fetch = vi.fn(async () => Response.json({ ownerId: "one", item }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (await writeInventory("one", "PATCH", { id: "unit", stage: "recon" }))
        .item,
    ).toEqual(item);
    expect(fetch.mock.calls[0]).toMatchObject([
      "/api/inventory",
      {
        method: "PATCH",
        headers: { "x-inventory-owner": "one" },
      },
    ]);
  });
  it.each([
    { ownerId: "two", item },
    { ownerId: "one", item: { ...item, dealerId: "two" } },
    { ownerId: "one", item: { ...item, id: "other" } },
    { ownerId: "one", item: { ...item, stage: "sold" } },
    { ownerId: "one" },
  ])("rejects an unrelated mutation confirmation %j", async (result) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(result)),
    );
    await expect(
      writeInventory("one", "PATCH", { id: "unit", stage: "recon" }),
    ).rejects.toThrow();
  });
  it("invalidates other inventory views for the owner while preserving the confirmed current view and other accounts", () => {
    invalidateInventoryViews("one", "/api/inventory?limit=100");
    const [matches, value, options] = cache.mutate.mock.calls[0] as unknown as [
      (key: unknown) => boolean,
      undefined,
      { revalidate: boolean },
    ];
    expect(matches(["/api/inventory?stage=recon&limit=100", "one"])).toBe(true);
    expect(matches(["/api/inventory?limit=100", "one"])).toBe(false);
    expect(matches(["/api/inventory?stage=recon&limit=100", "two"])).toBe(
      false,
    );
    expect(matches(["/api/outcomes", "one"])).toBe(false);
    expect(matches("/api/inventory")).toBe(false);
    expect(value).toBeUndefined();
    expect(options.revalidate).toBe(true);
  });
  it("accepts the same purchase after a later stage change and checks the actual paid amount", async () => {
    const saved = {
      ...item,
      purchasePrice: 1000.25,
      floorDate: "2026-01-15T00:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ownerId: "one", item: saved, replayed: true }),
      ),
    );
    const input = {
      id: "unit",
      purchasePrice: 1000.25,
      purchaseDate: "2026-01-15",
      stage: "acquired",
    };
    expect((await writeInventory("one", "POST", input)).item).toEqual(saved);
    await expect(
      writeInventory("one", "POST", { ...input, purchasePrice: 2000 }),
    ).rejects.toThrow();
    await expect(
      writeInventory("one", "POST", { ...input, purchaseDate: "2026-01-14" }),
    ).rejects.toThrow();
  });
  it("invalidates every inventory view after a purchase so the new unit appears on client navigation", () => {
    invalidateInventoryViews("one");
    const matches = cache.mutate.mock.calls[0][0] as unknown as (
      key: unknown,
    ) => boolean;
    expect(matches(["/api/inventory?limit=100", "one"])).toBe(true);
    expect(matches(["/api/inventory?stage=recon&limit=100", "one"])).toBe(true);
  });
});
