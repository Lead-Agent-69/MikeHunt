import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ paginate: vi.fn(), upsert: vi.fn() }));
vi.mock("../engine", async (original) => ({
  ...(await original<typeof import("../engine")>()),
  paginate: mocks.paginate,
}));
vi.mock("../pipeline", () => ({ upsertDeals: mocks.upsert }));
import { scrapeEbayMotors } from "./ebay-motors";
import { scrapeCraigslist } from "./index";
import { withScrapeRunScope } from "../run-scope-context";
import { createScraperRegistry } from "../runner";
import { ScraperExecutor } from "../tools/executor";
import { recordScrapePersistence } from "../source-run-context";
const row = (id: string) => ({
  source: "ebay_motors",
  source_deal_id: id,
  source_url: `https://www.ebay.com/itm/${id}`,
  images: ["https://i.ebayimg.com/a.jpg"],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CL_ENRICH", "false");
  mocks.upsert.mockImplementation(async (rows) => {
    recordScrapePersistence(rows.length, rows.length);
    return rows.length;
  });
});
describe("incremental marketplace collection", () => {
  it.each(["craigslist", "ebay_motors"])(
    "%s executor retains the actual early intake receipt and does not replay the page",
    async (source) => {
      mocks.paginate.mockImplementation(async function* () {
        yield [row("123")];
        throw new Error("later page failed");
      });
      const result = await new ScraperExecutor().execute(
        createScraperRegistry().get(source)!,
        { maxRetries: 2, retryDelayMs: 0 },
      );
      expect(result).toMatchObject({
        success: false,
        dealsFound: 1,
        dealsSaved: 1,
        error: "later page failed",
      });
      expect(mocks.paginate).toHaveBeenCalledTimes(1);
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["craigslist", "ebay_motors"])(
    "%s registry preserves deadline enforcement",
    async (source) => {
      await expect(
        createScraperRegistry()
          .get(source)!
          .fn({ deadlineAt: Date.now() - 1 }),
      ).rejects.toThrow("Source deadline exceeded");
      expect(mocks.paginate).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );

  it.each(["Craigslist", "eBay"])(
    "%s persists an early page before a later-page failure",
    async (source) => {
      mocks.paginate.mockImplementation(async function* () {
        yield [row("123")];
        expect(mocks.upsert).toHaveBeenCalledTimes(1);
        throw new Error("page two unavailable");
      });
      await expect(
        source === "eBay" ? scrapeEbayMotors(2) : scrapeCraigslist(),
      ).rejects.toThrow("page two unavailable");
      expect(mocks.upsert).toHaveBeenCalledWith([row("123")]);
    },
  );
  it("uses the buyer's actual eBay search rather than unrelated popular models and deduplicates pages", async () => {
    mocks.paginate.mockImplementation(async function* () {
      yield [row("123")];
      yield [row("123"), row("456")];
    });
    const count = await withScrapeRunScope(
      { state: "MO", make: "Ford", model: "Explorer", q: "SUVs" },
      () => scrapeEbayMotors(2),
    );
    expect(count).toBe(2);
    expect(mocks.paginate).toHaveBeenCalledTimes(1);
    expect(
      new URL(mocks.paginate.mock.calls[0][1](1)).searchParams.get("_nkw"),
    ).toBe("Ford Explorer");
    expect(mocks.upsert.mock.calls.map(([rows]) => rows.length)).toEqual([
      1, 1,
    ]);
  });
  it.each(["craigslist", "ebay_motors"])(
    "registry forwards cancellation to %s before requests and intake",
    async (source) => {
      const controller = new AbortController();
      controller.abort(new Error("cancelled"));
      await expect(
        createScraperRegistry()
          .get(source)!
          .fn({ abortSignal: controller.signal }),
      ).rejects.toThrow("cancelled");
      expect(mocks.paginate).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );
  it("stops the next page intake after cancellation while preserving the first page", async () => {
    const controller = new AbortController();
    mocks.paginate.mockImplementation(async function* (config) {
      expect(config.abortSignal).toBe(controller.signal);
      yield [row("123")];
      controller.abort(new Error("cancelled"));
      yield [row("456")];
    });
    await expect(
      scrapeEbayMotors(2, { abortSignal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});
