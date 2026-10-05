import { describe, expect, it } from "vitest";
import { craigslistSearchUrl, parseCraigslistResults } from "./index";

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
  it("reads the current static layout with the site's state", async () => {
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
      location_state: "TX",
      seller_type: "private",
    });
    expect(items[1].location_city).toBe("dallas");
  });
});
