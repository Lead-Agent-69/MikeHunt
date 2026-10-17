import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  crawl: vi.fn(),
  upsert: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../pipeline", () => ({ upsertDeals: mocks.upsert }));
vi.mock("../polite/polite-fetch", () => ({ politeFetch: mocks.fetch }));
vi.mock("../platforms/dealer-cms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platforms/dealer-cms")>()),
  crawlDealerCms: mocks.crawl,
}));
import { scrapeDealerCms } from "./index";
import { dealerCmsSiteFor, type DealerCmsSite } from "../platforms/dealer-cms";

describe("dealer CMS accepted-record receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CDG_DETAIL_LIMIT", "0");
    mocks.crawl.mockResolvedValue([
      { title: "2020 Ford Escape" },
      { title: "2018 Honda Civic" },
    ]);
  });
  afterEach(() => vi.unstubAllEnvs());
  const site = {
    name: "Test dealer",
    sourceId: "test-dealer",
  } as DealerCmsSite;
  it.each([0, 1, 2])(
    "returns %i accepted writes rather than parsed inventory",
    async (accepted) => {
      mocks.upsert.mockResolvedValue(accepted);
      expect(await scrapeDealerCms(site)).toBe(accepted);
      expect(mocks.upsert).toHaveBeenCalledWith(
        await mocks.crawl.mock.results[0].value,
      );
    },
  );
  it("does not write an empty parse result", async () => {
    mocks.crawl.mockResolvedValue([]);
    expect(await scrapeDealerCms(site)).toBe(0);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("propagates write failures instead of claiming accepted inventory", async () => {
    mocks.upsert.mockRejectedValue(new Error("write failed"));
    await expect(scrapeDealerCms(site)).rejects.toThrow("write failed");
  });
  it("enriches D&G's array-typed Vehicle schema and full native gallery before ingestion", async () => {
    vi.stubEnv("CDG_DETAIL_LIMIT", "1");
    const sourceUrl =
      "https://dgautollc.com/2022-ford-f250-platinum-fx4-4x4-1ft7w2bt3nec06696/";
    mocks.crawl.mockResolvedValue([
      {
        source_url: sourceUrl,
        title: "2022 Ford F250 Platinum FX4",
        ask_price: 38900,
      },
    ]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: `<script type="application/ld+json">${JSON.stringify({
        "@type": ["Product", "Vehicle"],
        vehicleIdentificationNumber: "1FT7W2BT3NEC06696",
        mileageFromOdometer: { value: 61876, unitCode: "SMI" },
        description: "Light front collision. All airbags intact.",
      })}</script><title>2022 Ford F250 - Salvage</title><div data-gallery><button data-full="/1.jpg"><img src="/thumb/1.jpg"></button><button data-full="/2.jpg" hidden><img src="/thumb/2.jpg"></button></div>`,
    });
    mocks.upsert.mockResolvedValue(1);
    expect(await scrapeDealerCms(dealerCmsSiteFor(sourceUrl)!)).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledWith(sourceUrl, {
      freshForMs: 24 * 3600_000,
    });
    expect(mocks.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        vin: "1FT7W2BT3NEC06696",
        mileage: 61876,
        images: ["https://dgautollc.com/1.jpg", "https://dgautollc.com/2.jpg"],
        description: "Light front collision. All airbags intact.",
        condition: "salvage_title",
        title_source: "listing",
      }),
    ]);
  });
});
