import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  cache: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../polite/polite-fetch", () => ({ politeFetch: mocks.fetch }));
vi.mock("./local-sold-cache", () => ({
  loadSoldItemCache: mocks.load,
  saveSoldItemCache: mocks.cache,
}));
import { fetchEbaySoldPage, scrapeEbaySold } from "./ebay-sold";
import { withScrapeRunReceipt } from "../source-run-context";
import { withLocalWriteContext } from "../local-write-context";
import { ScraperExecutor } from "../tools/executor";
import type { RegisteredScraper } from "../tools/registry";
const page = `<div class="s-card"><div class="s-card__title">2020 Ford Explorer XLT</div><span class="s-card__price">$17,500.00</span><a class="s-card__link" href="https://www.ebay.com/itm/123456"></a><div class="s-card__caption">Sold Oct 3, 2026</div></div>`;
function client(error: any = null) {
  const select = vi.fn().mockResolvedValue({
    data: error ? null : [{ source_item_id: "123456" }],
    error,
  });
  const upsert = vi.fn(() => ({ select }));
  return { client: { from: vi.fn(() => ({ upsert })) } as any, upsert, select };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(new Set());
  mocks.cache.mockResolvedValue(undefined);
});
describe("completed-listing source runtime truth", () => {
  it.each([
    { ok: false, status: 403, body: "", skipped: undefined },
    { ok: false, status: 0, body: "", skipped: "robots" },
    { ok: true, status: 200, body: "robot check", skipped: undefined },
  ])(
    "rejects barriers rather than reporting successful empty records: %j",
    async (response) => {
      mocks.fetch.mockResolvedValue(response);
      await expect(
        fetchEbaySoldPage("https://www.ebay.com/sch/i.html"),
      ).rejects.toThrow("unavailable");
    },
  );
  it("persists a valid query before the next query fails, retaining truthful executor receipts", async () => {
    const c = client();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("source refused"));
    const source = {
      id: "ebay_sold",
      fn: () =>
        scrapeEbaySold(undefined, {
          client: c.client,
          queries: ["Ford Explorer", "Honda Civic"],
          fetchPage,
          pause: async () => {
            expect(c.upsert).toHaveBeenCalledTimes(1);
          },
        }),
      enabled: true,
      estimatedDealsPerRun: 1,
    } as RegisteredScraper;
    const result = await new ScraperExecutor().execute(source, {
      maxRetries: 2,
      retryDelayMs: 0,
    });
    expect(result).toMatchObject({
      success: false,
      dealsFound: 1,
      dealsSaved: 1,
      error: "source refused",
    });
    expect(c.upsert).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(mocks.cache).toHaveBeenCalledWith(new Set(["123456"]));
  });
  it("does not advance local persisted IDs on database rejection", async () => {
    const c = client({ code: "denied" });
    await expect(
      scrapeEbaySold(undefined, {
        client: c.client,
        queries: ["Ford Explorer"],
        fetchPage: async () => page,
      }),
    ).rejects.toThrow("could not be stored");
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("honors cache-only mode without database writes or false saved counts", async () => {
    const c = client(),
      rememberOnly = vi.fn().mockResolvedValue(undefined);
    const result = await withScrapeRunReceipt("ebay_sold", () =>
      withLocalWriteContext(
        { cache: { rememberOnly } as any, cacheOnly: true },
        () =>
          scrapeEbaySold(undefined, {
            client: c.client,
            queries: ["Ford Explorer"],
            fetchPage: async () => page,
          }),
      ),
    );
    expect(result).toMatchObject({
      result: 0,
      receipt: { dealsFound: 1, dealsSaved: 0 },
    });
    expect(rememberOnly).toHaveBeenCalled();
    expect(c.upsert).not.toHaveBeenCalled();
  });
  it("retains observations locally when the storage guard pauses writing", async () => {
    const c = client(),
      rememberOnly = vi.fn().mockResolvedValue(undefined);
    await expect(
      withLocalWriteContext(
        {
          cache: { rememberOnly } as any,
          cacheOnly: false,
          beforeWrite: async () => false,
        },
        () =>
          scrapeEbaySold(undefined, {
            client: c.client,
            queries: ["Ford Explorer"],
            fetchPage: async () => page,
          }),
      ),
    ).rejects.toThrow("capacity guard");
    expect(rememberOnly).toHaveBeenCalled();
    expect(c.upsert).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it("stops aborted execution before reading cache, requesting pages or writing", async () => {
    const c = client(),
      controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const fetchPage = vi.fn();
    await expect(
      scrapeEbaySold(
        { abortSignal: controller.signal },
        { client: c.client, queries: ["Ford Explorer"], fetchPage },
      ),
    ).rejects.toThrow("cancelled");
    expect(fetchPage).not.toHaveBeenCalled();
    expect(c.upsert).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("counts previously persisted observations as observed, without duplicate writes", async () => {
    mocks.load.mockResolvedValue(new Set(["123456"]));
    const c = client();
    const result = await withScrapeRunReceipt("ebay_sold", () =>
      scrapeEbaySold(undefined, {
        client: c.client,
        queries: ["Ford Explorer"],
        fetchPage: async () => page,
      }),
    );
    expect(result).toMatchObject({
      result: 0,
      receipt: { dealsFound: 1, dealsSaved: 0 },
    });
    expect(c.upsert).not.toHaveBeenCalled();
  });
});
