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
import { CURATED_SITES } from "@/lib/scrapers/curated-sites";

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

describe("price and mileage guards", () => {
  it("uses DriveNation's all-in price, never the advertised savings or retail reference", () => {
    expect(
      parsePrice(
        "2023 Kia K5 LXS Savings: $2,180 All In Price $18,520 Retail $20,700",
      ),
    ).toBe(18520);
    expect(
      parsePrice("Retail Price $20,700 Savings: $2,180 All In Price $18,520"),
    ).toBe(18520);
    expect(parsePrice("Savings: $2,180 Retail $20,700")).toBeUndefined();
    expect(parsePrice("You Save: $2,180 MSRP: $20,700")).toBeUndefined();
    expect(parsePrice("$2,180 savings All-In Price: $18,520")).toBe(18520);
  });

  it("does not turn reference or financing-only amounts into a cash asking price", () => {
    expect(parsePrice("Retail Price $24,000 Sale Price $19,500")).toBe(19500);
    expect(parsePrice("Was: $24,000 Now: $19,500")).toBe(19500);
    expect(parsePrice("Down Payment: $2,180 $350/mo")).toBeUndefined();
    expect(parsePrice("Rebate: $2,180 Discount: $1,000")).toBeUndefined();
  });

  it("imports the asking price from a savings-first CMS card end to end", () => {
    const site = dealerCmsSiteFromCurated(
      CURATED_SITES.find((s) => s.url === "https://www.drivenation.com")!,
    )!;
    const page = parseListingPage(
      cheerio.load(
        `<div><a href="vehiclesDetail.php?123"><h3>2023 Kia K5 LXS</h3><img src="/k5.jpg"></a><p>47,729 Mi</p><p>Savings: $2,180</p><p>All In Price $18,520</p><p>Retail $20,700</p></div>`,
      ),
      site.inventoryUrl,
    );
    expect(page.cards).toHaveLength(1);
    expect(cardToDeal(page.cards[0], site)).toMatchObject({
      ask_price: 18520,
      year: 2023,
      make: "Kia",
      mileage: 47729,
    });
  });

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
