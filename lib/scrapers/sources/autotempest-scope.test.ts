import { afterEach, describe, expect, it, vi } from "vitest";
import { MISSOURI_SEARCH_ZIPS } from "@/lib/geo/missouri-markets";
const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("../pipeline", () => ({ upsertDeals: mocks.upsert }));
import {
  autotempestBuyerQueries,
  autotempestRegionalZips,
  scrapeAutotempest,
} from "./autotempest";
import { withScrapeRunScope } from "../run-scope-context";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("buyer-scoped aggregator searches", () => {
  it("covers all Missouri metros, not random nationwide centers", () => {
    expect(
      autotempestRegionalZips(undefined, () => 0, { state: "MO" }),
    ).toEqual(MISSOURI_SEARCH_ZIPS);
  });
  it("respects explicit makes and models", () => {
    expect(
      autotempestBuyerQueries({ makes: ["Honda", "Toyota"], model: "Civic" }),
    ).toEqual([
      { make: "honda", model: "Civic" },
      { make: "toyota", model: "Civic" },
    ]);
  });
  it("does not restrict category-only buyers to preset pickup/sedan models", () => {
    expect(
      autotempestBuyerQueries({ vehicleType: "suv" }).every(
        (query) => !query.model,
      ),
    ).toBe(true);
    expect(autotempestBuyerQueries({ vehicleType: "suv" })).toContainEqual({
      make: "jeep",
    });
  });
  it("skips the national pass for a scoped request and returns zero for no rows", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetcher);
    expect(
      await withScrapeRunScope(
        { state: "MO", make: "Ford", model: "Explorer" },
        () => scrapeAutotempest(),
      ),
    ).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(MISSOURI_SEARCH_ZIPS.length);
    const urls = fetcher.mock.calls.map(([url]) => new URL(url));
    expect(urls.map((url) => url.searchParams.get("zip"))).toEqual(
      MISSOURI_SEARCH_ZIPS,
    );
    for (const url of urls) {
      expect(url.searchParams.get("radius")).toBe("250");
      expect(url.searchParams.get("make")).toBe("ford");
      expect(url.searchParams.get("model")).toBe("Explorer");
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("reports accepted rows instead of scraped rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "one",
              price: 18000,
              make: "Ford",
              model: "Explorer",
              year: 2020,
              location: "St. Louis, MO",
              url: "https://dealer.test/car",
            },
          ],
        }),
      }),
    );
    mocks.upsert.mockResolvedValue(0);
    expect(
      await withScrapeRunScope({ state: "MO", make: "Ford" }, () =>
        scrapeAutotempest(),
      ),
    ).toBe(0);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ location_state: "MO" }),
      ]),
    );
  });
});
