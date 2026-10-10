import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  browser: vi.fn(),
  ai: vi.fn(),
}));
vi.mock("./pipeline", () => ({ upsertDeals: mocks.save }));
vi.mock("./tools/ai-extract", () => ({
  aiExtractEnabled: () => true,
  aiExtractVehicles: mocks.ai,
}));
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
    mocks.ai.mockResolvedValue([]);
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
  it("supplements partial selector matches without duplicates or missing prices", async () => {
    const structured = [
      { name: "2020 Ford Escape", url: "/cars/123", offers: { price: 12500 } },
      { name: "2021 Honda Civic", url: "/cars/456", offers: { price: 14000 } },
      { name: "2022 Toyota Corolla", url: "/cars/789" },
      {
        name: "2023 Ford Explorer",
        url: "/inventory",
        offers: { price: 21000 },
      },
    ].map((car) => ({ "@type": "Car", ...car }));
    const page = `${html}<script type="application/ld+json">${JSON.stringify(structured)}</script><!--${" ".repeat(1600)}-->`;
    mocks.save.mockResolvedValue(2);
    const fetcher = vi.fn(async () => page);
    expect(
      await scrapeIndependentDealer(
        profile,
        "https://dealer.example",
        undefined,
        fetcher,
      ),
    ).toBe(2);
    const saved = mocks.save.mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(saved.map((car: any) => car.source_url)).toEqual([
      "https://dealer.example/cars/123",
      "https://dealer.example/cars/456",
    ]);
    expect(saved.every((car: any) => car.ask_price >= 100)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not spend on AI or admit a structured listing without a price", async () => {
    const page = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Car",
      name: "2021 Honda Civic",
      url: "/cars/456",
    })}</script><!--${" ".repeat(1600)}-->`;
    expect(
      await scrapeIndependentDealer(
        profile,
        "https://dealer.example",
        undefined,
        async () => page,
      ),
    ).toBe(0);
    expect(mocks.save.mock.calls[0][0]).toEqual([]);
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("follows SalvageZone's real path pagination and excludes held/sold stock", async () => {
    const card = (id: number, price: string, status = "inStock") =>
      `<div class="featured-item"><a href="/inventory/salvage/repairable/2024/CHEVROLET/${id}"><img src="/images/${id}.jpg"><h2>2024 CHEVROLET EXPRESS 2500</h2></a><span class="${status}">${price}</span><div class="car-info"><li><i class="icon-road2"></i>37977</li><li><i class="fa-file"></i>Rebuilt Title</li></div></div>`;
    const first =
      card(123, "$19,900") +
      card(124, "On Hold", "onHold") +
      card(125, "Sold", "Sold") +
      '<div class="pagination"><div class="next"><a href="/repairable/salvage/rebuildables/2">Next Page</a></div></div>';
    const second = card(126, "$18,900");
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/2") ? second : first,
    );
    mocks.save.mockResolvedValue(2);
    expect(
      await autoDiscoverAndCrawl(
        "https://www.salvagezone.com",
        { inventoryUrl: "/inventory", name: "SalvageZone", state: "NY" },
        undefined,
        fetcher,
      ),
    ).toBe(2);
    expect(fetcher.mock.calls.map((call) => call[0])).toContain(
      "https://www.salvagezone.com/repairable/salvage/rebuildables/2",
    );
    const saved = mocks.save.mock.calls[0][0];
    expect(saved.map((row: any) => row.source_deal_id)).toEqual(["123", "126"]);
    expect(saved[0]).toMatchObject({
      mileage: 37977,
      condition: "rebuilt_title",
      ask_price: 19900,
    });
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("rejects homepage links from both selectors and AI rescue", async () => {
    await scrapeIndependentDealer(
      profile,
      "https://dealer.example",
      undefined,
      async () => html.replace("/cars/123", "/"),
    );
    expect(mocks.save.mock.calls[0][0]).toEqual([]);
    vi.clearAllMocks();
    mocks.ai.mockResolvedValue([
      {
        year: 2024,
        make: "Ford",
        model: "Escape",
        price: 12000,
        url: "https://dealer.example",
      },
    ]);
    await scrapeIndependentDealer(
      profile,
      "https://dealer.example",
      undefined,
      async () => `<main>${" ".repeat(1700)}</main>`,
    );
    expect(mocks.ai).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0]).toEqual([]);
  });
});
vi.mock("./source-compliance", async (original) => ({
  ...(await original<typeof import("./source-compliance")>()),
  policyBlockFor: () => undefined,
}));
