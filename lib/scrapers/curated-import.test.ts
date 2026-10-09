import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), browser: vi.fn() }));
vi.mock("./pipeline", () => ({ upsertDeals: mocks.save }));
vi.mock("./engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("./engine")>();
  return {
    ...original,
    fetchBrowser: mocks.browser,
    paginate: async function* (
      config: any,
      url: (page: number) => string,
      parse: any,
    ) {
      for (let page = 1; page <= 3; page += 1) {
        const result = await parse(await config.fetchPageHtml(url(page)));
        if (!result.items.length) break;
        yield result.items;
        if (!result.hasMore) break;
      }
    },
  };
});
import { autoDiscoverAndCrawl, scrapeIndependentDealer } from "./sources";

const html = `<article><h2>2020 Ford Escape</h2><span class="price">$12,500</span><a href="/cars/123">Car</a></article><a rel="next" href="?page=2">Next</a>`;
const profile = {
  dealerId: "dealer",
  name: "Dealer",
  city: "Lexington",
  state: "KY",
  inventoryUrl: "/inventory",
  selectors: { dealCard: "article", title: "h2", price: ".price", link: "a" },
};

describe("curated import receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue(0);
  });
  it("stops repeated pages and returns accepted rows, not parsed rows", async () => {
    const fetcher = vi.fn(async () => html);
    expect(
      await scrapeIndependentDealer(
        profile,
        "https://dealer.example",
        undefined,
        fetcher,
      ),
    ).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.browser).not.toHaveBeenCalled();
  });
  it("uses the real inventory link rather than saved-vehicle account links", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === "https://dealer.example"
        ? '<a href="/mysavedvehicles">Saved vehicles</a><a href="/inventory">Inventory</a>'
        : html,
    );
    mocks.save.mockResolvedValue(1);
    expect(
      await autoDiscoverAndCrawl(
        "https://dealer.example",
        { name: "Dealer", state: "KY" },
        undefined,
        fetcher,
      ),
    ).toBe(1);
    expect(fetcher.mock.calls[1][0]).toContain("/inventory?page=1");
    expect(mocks.browser).not.toHaveBeenCalled();
  });
});
