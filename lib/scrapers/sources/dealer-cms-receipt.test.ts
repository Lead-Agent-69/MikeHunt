import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ crawl: vi.fn(), upsert: vi.fn() }));
vi.mock("../pipeline", () => ({ upsertDeals: mocks.upsert }));
vi.mock("../platforms/dealer-cms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platforms/dealer-cms")>()),
  crawlDealerCms: mocks.crawl,
}));
import { scrapeDealerCms } from "./index";
import type { DealerCmsSite } from "../platforms/dealer-cms";

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
});
