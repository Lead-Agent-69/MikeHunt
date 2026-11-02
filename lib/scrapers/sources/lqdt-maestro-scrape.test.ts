import { afterEach, expect, it, vi } from "vitest";
vi.mock("../pipeline", () => ({ upsertDeals: vi.fn(async () => 1) }));
import { upsertDeals } from "../pipeline";
import { scrapeMaestro, fetchMaestroAssets } from "./lqdt-maestro";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("preserves distinct sellers' vehicles sharing a local asset number", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assetSearchResults: [
          { assetId: 7, accountId: 100 },
          { assetId: 7, accountId: 200 },
          { assetId: 7, accountId: 100 },
        ],
      }),
    }),
  );
  expect(await fetchMaestroAssets("GD", ["94A"], { maxPages: 1 })).toEqual([
    { assetId: 7, accountId: 100 },
    { assetId: 7, accountId: 200 },
  ]);
});

it("does not stop pagination when the next page starts with another seller's same asset number", async () => {
  const firstPage = Array.from({ length: 120 }, (_, i) => ({
    assetId: i + 7,
    accountId: 100,
  }));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ assetSearchResults: firstPage }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          assetSearchResults: [{ assetId: 7, accountId: 200 }],
        }),
      }),
  );
  const rows = await fetchMaestroAssets("GD", ["94A"], { maxPages: 2 });
  expect(rows).toHaveLength(121);
  expect(rows.at(-1)).toEqual({ assetId: 7, accountId: 200 });
});

it("does not merge a detail response belonging to another lot into the search vehicle", async () => {
  vi.stubEnv("MAESTRO_DETAIL_LIMIT", "1");
  const asset = {
    assetId: 7,
    accountId: 31897,
    modelYear: "2000",
    makebrand: "Toyota",
    model: "Avalon",
    assetShortDescription: "2000 Toyota Avalon",
    currentBid: 9000,
    photo: "31897_7_cover.jpg",
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ assetSearchResults: [asset] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...asset,
          assetId: 8,
          assetLongDesc: "Wrong vehicle",
          vinserial: "WRONG",
        }),
      }),
  );
  await scrapeMaestro({
    businessId: "GD",
    categoryCodes: ["94A"],
    source: "gov_auction",
    idPrefix: "gd",
    defaultSeller: "GovDeals",
    label: "GovDeals",
    maxPages: 1,
  });
  expect(upsertDeals).toHaveBeenCalledOnce();
  const row = vi.mocked(upsertDeals).mock.calls[0][0][0];
  expect(row.source_deal_id).toBe("gd-7-31897");
  expect(row.vin).toBeUndefined();
  expect(row.options?.description).toBe("");
});
