import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  VEHICLESNETWORK_DETAIL,
  cardToDeal,
  dealerCmsSiteFromCurated,
  parseListingPage,
  parseMiles,
  parsePrice,
  pageUrlFor,
} from "./dealer-cms";
import {
  CURATED_SITES,
  isCuratedSiteEnabled,
} from "@/lib/scrapers/curated-sites";

// Trimmed from a live VehiclesNETWORK inventory card (usedcarsokc.com/autos, 2026-10-10).
const VN_PAGE = `<html><body>
<div class="vehicle-list">
 <div class="ai-auto">
  <a href="autos/2015-Nissan-Armada-Oklahoma-City-OK-2711"><img src="uploads/a.jpg"></a>
  <span>26 Photos</span>
  <h3><a href="autos/2015-Nissan-Armada-Oklahoma-City-OK-2711">2015 Nissan Armada SL 4x2 4dr SUV</a></h3>
  <strong>Payment Amount:</strong> <span>$325.00</span>
  <strong>Make:</strong> Nissan <strong>Mileage:</strong> 124,613
  <strong>Stock No.:</strong> 15900/2400/325/25 C
  <h4>Pre-Owned</h4><h4>Sale Price</h4><div>$ <span>10,900</span> <sup>00</sup></div>
  <h5>124K Miles</h5><h5>Features</h5>
  <a href="applications?te_class=autos_app&te_mode=insert&autoID=2711">Apply</a>
 </div>
 <div class="ai-auto">
  <a href="autos/2017-Kia-Optima-Oklahoma-City-OK-2650"><img src="uploads/b.jpg"></a>
  <h3><a href="autos/2017-Kia-Optima-Oklahoma-City-OK-2650">2017 Kia Optima LX 4dr Sedan</a></h3>
  <strong>Down Payment:</strong> $299.00 <strong>Mileage:</strong> 109,074
  <h4>Price:</h4><div>$299 Down</div><div>$7,900</div><div>$210 Bi-Weekly</div>
 </div>
</div>
<a href="autos?ai_page=2">2</a><a href="autos?ai_page=21">21</a>
</body></html>`;

describe("platform dealers (no per-site config)", () => {
  const vn = dealerCmsSiteFromCurated({
    url: "https://www.usedcarsokc.com",
    name: "Super Sports & Imports",
    state: "OK",
    city: "Oklahoma City",
    type: "independent_dealer",
    platform: "vehiclesnetwork",
  })!;

  it("builds a VehiclesNETWORK config from a registry line", () => {
    expect(vn.inventoryUrl).toBe("https://www.usedcarsokc.com/autos");
    expect(vn.sourceId).toBe("vehiclesnetwork-usedcarsokc-com");
    expect(pageUrlFor(vn, 3)).toBe(
      "https://www.usedcarsokc.com/autos?ai_page=3",
    );
    expect(
      VEHICLESNETWORK_DETAIL.test(
        "autos/2015-Nissan-Armada-Oklahoma-City-OK-2711",
      ),
    ).toBe(true);
    expect(VEHICLESNETWORK_DETAIL.test("applications?autoID=2711")).toBe(false);
  });

  it("reads VehiclesNETWORK cards: sale price over payments, title without spec labels", () => {
    const page = parseListingPage(cheerio.load(VN_PAGE), vn.inventoryUrl, [
      vn.detailPattern!,
    ]);
    expect(page.lastPage).toBe(21);
    const deals = page.cards.map((c) => cardToDeal(c, vn));
    expect(deals[0]).toMatchObject({
      title: "2015 Nissan Armada SL 4x2 4dr SUV",
      year: 2015,
      make: "Nissan",
      ask_price: 10900,
      mileage: 124613,
      location_state: "OK",
      source_deal_id:
        "vehiclesnetwork-usedcarsokc-com-2015-Nissan-Armada-Oklahoma-City-OK-2711",
    });
    expect(deals[1]).toMatchObject({ ask_price: 7900, mileage: 109074 });
  });

  it("a 4cdg registry line gets the shared parser with the type's title default", () => {
    const s = dealerCmsSiteFromCurated({
      url: "https://www.mnrepairables.com",
      name: "MN Motors",
      state: "MN",
      type: "rebuilder_dealer",
      platform: "4cdg",
    })!;
    expect(s.inventoryUrl).toBe("https://www.mnrepairables.com/vehicles.php");
    expect(s.defaultCondition).toBe("rebuilt_title");
    expect(s.detailPattern).toBeUndefined();
  });

  it("untagged or stateless registry lines keep their existing crawl path", () => {
    expect(
      dealerCmsSiteFromCurated({
        url: "https://x.example",
        name: "x",
        state: "TX",
        type: "independent_dealer",
      }),
    ).toBeUndefined();
    expect(
      dealerCmsSiteFromCurated({
        url: "https://x.example",
        name: "x",
        type: "independent_dealer",
        platform: "4cdg",
      }),
    ).toBeUndefined();
  });

  it("every platform-tagged registry site has a state and a parser config", () => {
    const tagged = CURATED_SITES.filter((s) => s.platform);
    expect(tagged.length).toBeGreaterThanOrEqual(20);
    for (const s of tagged) {
      expect(s.state, s.url).toMatch(/^[A-Z]{2}$/);
      expect(dealerCmsSiteFromCurated(s), s.url).toBeDefined();
    }
  });
});

describe("terms gate (Elle, 2026-10-10)", () => {
  it("no-terms-page VehiclesNETWORK dealers are registered but off, awaiting Jonah", () => {
    for (const host of ["usedcarslewistonid.com", "usedcarsdedhamma.com"]) {
      const s = CURATED_SITES.find((c) => c.url.includes(host))!;
      expect(s.enabled, host).toBe(false);
      expect(isCuratedSiteEnabled(s), host).toBe(false);
      expect(s.termsNote, host).toMatch(/^awaiting Jonah terms decision/);
      expect(dealerCmsSiteFromCurated(s), host).toBeDefined();
    }
    expect(isCuratedSiteEnabled({})).toBe(true);
  });
});

describe("price and mileage guards", () => {
  it("skips payment amounts", () => {
    expect(parsePrice("Payment Amount: $325.00 Sale Price $ 10,900 00")).toBe(
      10900,
    );
    expect(
      parsePrice(
        "Down Payment: $299.00 Price: $299 Down $8,995 $210 Bi-Weekly",
      ),
    ).toBe(8995);
    expect(parsePrice("$350/mo or $14,500")).toBe(14500);
    expect(parsePrice("$12,500")).toBe(12500);
  });

  it("never reads 4x4 or a price as the odometer", () => {
    expect(
      parseMiles("Big Horn 2500 4x4 $29,500 Miles: 83,698 Title: Rebuilt"),
    ).toBe(83698);
    expect(parseMiles("$9,300 Miles: 20,391")).toBe(20391);
    expect(parseMiles("47k / Front / $5,450")).toBe(47000);
    expect(parseMiles("Runs 120,000 miles")).toBe(120000);
  });
});
