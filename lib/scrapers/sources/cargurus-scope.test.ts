import { beforeEach, describe, expect, it, vi } from "vitest";
import { MISSOURI_SEARCH_ZIPS } from "@/lib/geo/missouri-markets";
import { metroZipsForState, STATE_METRO_ZIPS } from "@/lib/geo/metro-zips";
vi.mock("../engine", () => ({ paginate: vi.fn() }));
vi.mock("../pipeline", () => ({ upsertDeals: vi.fn() }));
import { paginate } from "../engine";
import { upsertDeals } from "../pipeline";
import { withScrapeRunScope } from "../run-scope-context";
import {
  cargurusSearchZips,
  parseCargurusListings,
  scrapeCarGurus,
} from "./cargurus";

beforeEach(() => vi.clearAllMocks());

describe("CarGurus location scope", () => {
  it("prioritizes buyer states over explicit ZIP and unrelated sweep", () => {
    expect(
      cargurusSearchZips(
        "75201",
        { state: "MO" },
        {
          states: ["TX"],
          zipsByState: { TX: ["75201"] },
        },
      ),
    ).toEqual(MISSOURI_SEARCH_ZIPS);
    expect(cargurusSearchZips("", { state: "IL" })).toEqual(
      metroZipsForState("IL", STATE_METRO_ZIPS.IL.length),
    );
    expect(cargurusSearchZips("", { state: "ZZ" })).toEqual([]);
  });

  it("uses explicit ZIP or planned centers for non-buyer runs", () => {
    expect(cargurusSearchZips("63101", undefined)).toEqual(["63101"]);
    expect(
      cargurusSearchZips("", undefined, {
        states: ["MO"],
        zipsByState: { MO: ["63101", "64106"] },
      }),
    ).toEqual(["63101", "64106"]);
  });

  it("searches all Missouri centers with buyer query, bounded pages, and deduped rows", async () => {
    const urls: URL[] = [];
    vi.mocked(paginate).mockImplementation((config, urlForPage) => {
      expect(config.maxPages).toBe(3);
      urls.push(new URL(urlForPage(1)));
      return (async function* () {
        yield [
          { source_deal_id: "shared", source: "cargurus", ask_price: 18000 },
        ];
      })() as ReturnType<typeof paginate>;
    });
    const count = await withScrapeRunScope(
      { state: "MO", q: "SUVs Ford", model: "Explorer" },
      () => scrapeCarGurus("", "75201"),
    );
    expect(urls.map((url) => url.searchParams.get("zip"))).toEqual(
      MISSOURI_SEARCH_ZIPS,
    );
    expect(
      urls.every(
        (url) => url.searchParams.get("searchTerm") === "Ford Explorer",
      ),
    ).toBe(true);
    expect(count).toBe(1);
    expect(upsertDeals).toHaveBeenCalledTimes(1);
  });

  it("retains source-reported location without treating default condition as title proof", () => {
    const rows = parseCargurusListings(
      JSON.stringify({
        listings: [
          { id: 1, price: 18000, sellerCity: "St. Louis", sellerState: "mo" },
          { id: 2, price: 19000, location: { city: "Chicago", state: "IL" } },
          { id: 3, price: 20000, state: "ZZ" },
        ],
      }),
    );
    expect(rows[0]).toMatchObject({
      location_city: "St. Louis",
      location_state: "MO",
      title_source: "source_default",
    });
    expect(rows[1]).toMatchObject({
      location_city: "Chicago",
      location_state: "IL",
    });
    expect(rows[2].location_state).toBeUndefined();
    expect(rows[2].location_city).toBeUndefined();
  });
});
