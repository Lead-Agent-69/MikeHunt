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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  const site = {
    name: "Test dealer",
    sourceId: "test-dealer",
  } as DealerCmsSite;
  it("persists matched detail cash evidence with the response's observation time", async () => {
    vi.stubEnv("CDG_DETAIL_LIMIT", "1");
    const source_url =
      "https://dgautollc.com/2022-ford-f250-1ft7w2bt3nec06696/";
    mocks.crawl.mockResolvedValue([
      {
        source_url,
        title: "2022 Ford F250",
        vin: "1FT7W2BT3NEC06696",
        ask_price: 999,
      },
    ]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      observedAt: "2026-10-20T12:00:00Z",
      body: `<script type="application/ld+json">${JSON.stringify({ "@type": "Vehicle", vehicleIdentificationNumber: "1FT7W2BT3NEC06696", description: "Down payment $999. Cash price $18,000." })}</script>`,
    });
    mocks.upsert.mockResolvedValue(1);
    await scrapeDealerCms(dealerCmsSiteFor(source_url)!);
    expect(
      mocks.upsert.mock.calls[0][0][0].options.priceEvidence,
    ).toMatchObject({
      kind: "asking",
      askingPrice: 18000,
      checkedAt: "2026-10-20T12:00:00Z",
    });
  });
  it("does not replace a known vehicle with a different VIN served at its old URL", async () => {
    vi.stubEnv("CDG_DETAIL_LIMIT", "1");
    const row = {
      source_url: "https://dgautollc.com/car/",
      title: "2022 Ford F250",
      vin: "1FT7W2BT3NEC06696",
      mileage: 1000,
    };
    mocks.crawl.mockResolvedValue([row]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      observedAt: "2026-10-20T12:00:00Z",
      body: '<script type="application/ld+json">{"@type":"Vehicle","vehicleIdentificationNumber":"1HGCM82633A004352","description":"Cash price $1,000"}</script>',
    });
    mocks.upsert.mockResolvedValue(1);
    await scrapeDealerCms(dealerCmsSiteFor(row.source_url)!);
    expect(mocks.upsert).toHaveBeenCalledWith([row]);
  });
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
  it("saves all inventory when the remaining deadline is reserved for persistence", async () => {
    vi.stubEnv("CDG_DETAIL_LIMIT", "2");
    mocks.upsert.mockResolvedValue(2);
    expect(
      await scrapeDealerCms(site, undefined, {
        deadlineAt: Date.now() + 59_000,
      }),
    ).toBe(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      await mocks.crawl.mock.results[0].value,
    );
  });
  it("defers further galleries after a detail fetch consumes the remaining budget", async () => {
    vi.stubEnv("CDG_DETAIL_LIMIT", "2");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const rows = ["one", "two"].map((id) => ({
      source_url: `https://dgautollc.com/${id}/`,
      title: "2020 Ford Escape",
    }));
    mocks.crawl.mockResolvedValue(rows);
    mocks.fetch.mockImplementation(async () => {
      clock.mockReturnValue(1_061_000);
      return {
        ok: true,
        body: '<div data-gallery><img src="/photo.jpg"></div>',
      };
    });
    mocks.upsert.mockResolvedValue(2);
    const controller = new AbortController();
    expect(
      await scrapeDealerCms(dealerCmsSiteFor(rows[0].source_url)!, undefined, {
        deadlineAt: 1_120_000,
        abortSignal: controller.signal,
      }),
    ).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(rows[0].source_url, {
      freshForMs: 24 * 3600_000,
      signal: controller.signal,
    });
    expect(mocks.upsert.mock.calls[0][0]).toHaveLength(2);
  });
  it("does not start a canceled crawl or persist after cancellation during detail work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      scrapeDealerCms(site, undefined, { abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(mocks.crawl).not.toHaveBeenCalled();
    const duringDetail = new AbortController();
    vi.stubEnv("CDG_DETAIL_LIMIT", "1");
    mocks.crawl.mockResolvedValue([
      { source_url: "https://dgautollc.com/car/", title: "2020 Ford Escape" },
    ]);
    mocks.fetch.mockImplementation(async () => {
      duringDetail.abort();
      throw new Error("Canceled");
    });
    await expect(
      scrapeDealerCms(
        dealerCmsSiteFor("https://dgautollc.com/car/")!,
        undefined,
        { abortSignal: duringDetail.signal },
      ),
    ).rejects.toThrow();
    expect(mocks.upsert).not.toHaveBeenCalled();
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
