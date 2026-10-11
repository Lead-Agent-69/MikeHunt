import { describe, expect, it } from "vitest";
import {
  craigslistSearchUrl,
  craigslistSitesForRun,
  parseCraigslistResults,
  craigslistListingState,
} from "./index";

// Current static (no-js) Craigslist layout, trimmed from a real Dallas page on 2026-10-04.
const PAGE = `
<ol class="cl-static-search-results">
<li class="cl-static-search-result" title="2020 Bmw 330i">
  <a href="https://www.craigslist.org/view/d/dallas-2020-bmw-330i/bhN566ELap8qnCXb64YZtX">
    <div class="title">2020 Bmw 330i</div>
    <div class="details">
      <div class="price">$13,998</div>
      <div class="location">
          North Dallas
      </div>
    </div>
  </a>
</li>
<li class="cl-static-search-result" title="2014 Ford F-150 XLT">
  <a href="https://www.craigslist.org/view/d/plano-2014-ford-150-xlt/9xYQ2">
    <div class="title">2014 Ford F-150 XLT</div>
    <div class="details"><div class="price">$9,500</div></div>
  </a>
</li>
</ol>`;

describe("craigslistSearchUrl", () => {
  it("does not impose a hidden price ceiling when the buyer has none", () => {
    expect(
      new URL(
        craigslistSearchUrl("stlouis", "cto", 1, "", 500, 35000, {
          state: "MO",
        }),
      ).searchParams.has("max_price"),
    ).toBe(false);
  });
  it("uses buyer states even when an operator shard or unrelated sweep is configured", () => {
    const sites = craigslistSitesForRun(undefined, "dallas", { state: "MO" });
    expect(sites).toContain("stlouis");
    expect(sites).toContain("kansascity");
    expect(sites).not.toContain("dallas");
    expect(
      craigslistSitesForRun(undefined, "dallas", { states: ["MO", "IL"] }),
    ).toContain("chicago");
    expect(craigslistSitesForRun(undefined, "dallas", { state: "ZZ" })).toEqual(
      [],
    );
  });

  it("passes buyer price, year, mileage and model criteria without a literal SUV filter", () => {
    const url = new URL(
      craigslistSearchUrl("stlouis", "cto", 2, "unrelated", 500, 35000, {
        q: "SUVs Ford",
        model: "Explorer",
        minPrice: 1000,
        maxPrice: 50000,
        minYear: 2018,
        maxMileage: 90000,
      }),
    );
    expect(url.searchParams.get("query")).toBe("Ford Explorer");
    expect(url.searchParams.get("min_price")).toBe("1000");
    expect(url.searchParams.get("max_price")).toBe("50000");
    expect(url.searchParams.get("min_auto_year")).toBe("2018");
    expect(url.searchParams.get("max_auto_miles")).toBe("90000");
    expect(url.searchParams.get("s")).toBe("120");
  });
  it("sends no full-text query by default, so the whole category comes back", () => {
    const url = new URL(craigslistSearchUrl("dallas", "cto", 1));
    expect(url.searchParams.has("query")).toBe(false);
    expect(url.searchParams.get("min_price")).toBe("500");
    expect(url.searchParams.has("s")).toBe(false);
  });

  it("keeps an explicit query and pages by 120", () => {
    const url = new URL(craigslistSearchUrl("dallas", "ctd", 3, "tacoma"));
    expect(url.searchParams.get("query")).toBe("tacoma");
    expect(url.searchParams.get("s")).toBe("240");
    expect(url.pathname).toBe("/search/ctd");
  });
});

describe("parseCraigslistResults", () => {
  it("reads the layout without mistaking the site's region for the listing state", async () => {
    const { items } = await parseCraigslistResults(PAGE, "dallas", {
      path: "cto",
      source: "craigslist",
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: "craigslist",
      source_deal_id: "bhN566ELap8qnCXb64YZtX",
      year: 2020,
      ask_price: 13998,
      location_city: "North Dallas",
      seller_type: "private",
    });
    expect(items[0].location_state).toBeUndefined();
    expect(items[0].metadata).toMatchObject({
      search_market_state: "TX",
      location_state_source: "unverified",
    });
    expect(items[1].location_city).toBe("dallas");
  });
});

describe("Craigslist listing state evidence", () => {
  it.each([
    ["Merriam, KS", "KS"],
    ["St. Louis MO 63101", "MO"],
    ["Springfield, IL", "IL"],
    ["Kansas City", undefined],
    ["North Dallas", undefined],
    ["XX", undefined],
  ])(
    "reads %s without inferring a state from the search region",
    (location, state) => {
      expect(craigslistListingState(location!)).toBe(state);
    },
  );
  it("keeps explicit cross-border listings out of the requested state's intake", async () => {
    const { items } = await parseCraigslistResults(
      PAGE.replace("North Dallas", "Merriam, KS"),
      "kansascity",
      { path: "ctd", source: "craigslist_dealer" },
    );
    expect(items[0].location_state).toBe("KS");
    expect(items[0].metadata).toMatchObject({
      search_market_state: "MO",
      location_state_source: "listing",
    });
  });
});
