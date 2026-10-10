import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  cardToDeal,
  crawlDealerCms,
  dealerCmsSiteFromCurated,
  nextPageHref,
  parseDealerCmsPage,
  sitemapDetailUrls,
  vinFromUrl,
  type DealerCmsDeps,
} from "./dealer-cms";
import {
  CURATED_SITES,
  isCuratedSiteEnabled,
} from "@/lib/scrapers/curated-sites";
import { DomainLimiter } from "@/lib/scrapers/polite/limiter";
import { MemoryPageCache } from "@/lib/scrapers/polite/cache";
import {
  PoliteCrawler,
  type FetchLike,
} from "@/lib/scrapers/polite/polite-fetch";
import { robotsAllows } from "@/lib/scrapers/source-compliance";

const ld = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const site = (line: Record<string, unknown>) =>
  dealerCmsSiteFromCurated({
    type: "independent_dealer",
    name: "x",
    state: "DE",
    ...line,
  } as any)!;
const parse = (
  s: ReturnType<typeof site>,
  html: string,
  url = s.inventoryUrl,
) => parseDealerCmsPage(s, cheerio.load(html), html, url);

// Trimmed from the live pages Elle saved on 2026-10-10 (tos/zero_states/pages/).
const OVERFUEL_PAGE = (n: number, next?: string) => `<html><head>
${next ? `<link rel="next" href="${next}"/>` : ""}
${ld({
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "114 used cars and SUVs for sale in New Castle, DE",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "Product",
        name: `2019 Nissan Pathfinder SV Sport Utility 4D`,
        url: `https://www.carmartde.com/inventory/used-2019-nissan-pathfinder-sv-sport-utility-4d-5n1dr2mm9kc61598${n}-in-new-castle-and-smyrna-de`,
        image: "https://static.overfuel.com/photos/1398/2065061/a.webp",
        offers: {
          "@type": "Offer",
          price: "14849",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      },
    },
    {
      "@type": "ListItem",
      position: 2,
      item: {
        "@type": "Product",
        name: `2016 Chevrolet Malibu LS Sedan 4D`,
        url: `https://www.carmartde.com/inventory/used-2016-chevrolet-malibu-ls-sedan-4d-1g1zb5st8gf23005${n}-in-new-castle-and-smyrna-de`,
        offers: {
          "@type": "Offer",
          price: "10129",
          availability: "https://schema.org/SoldOut",
        },
      },
    },
  ],
})}</head><body>
<a href="/inventory?highlights[]=Apple%20CarPlay">Apple CarPlay</a>
<a href="/inventory?highlights%5B%5D=Heated%20Seats">Heated seats</a>
</body></html>`;

describe("JSON-LD platforms through the shared parser (generic-extractor)", () => {
  it("Overfuel: ItemList Products, VIN from the slug, sold offers skipped, rel=next", () => {
    const s = site({ url: "https://www.carmartde.com", platform: "overfuel" });
    expect(s).toMatchObject({
      inventoryUrl: "https://www.carmartde.com/inventory",
      layout: "jsonld",
      pagination: "next-link",
    });
    const html = OVERFUEL_PAGE(3, "https://www.carmartde.com/inventory/page/2");
    const page = parse(s, html);
    expect(page.cards).toHaveLength(2);
    const deals = page.cards.map((c) => cardToDeal(c, s));
    expect(deals[0]).toMatchObject({
      title: "2019 Nissan Pathfinder SV Sport Utility 4D",
      year: 2019,
      make: "Nissan",
      ask_price: 14849,
      vin: "5N1DR2MM9KC615983",
      location_state: "DE",
      source: "independent_dealer",
      images: ["https://static.overfuel.com/photos/1398/2065061/a.webp"],
    });
    expect(deals[1]).toBeNull(); // SoldOut
    expect(nextPageHref(cheerio.load(html), s.inventoryUrl)).toBe(
      "https://www.carmartde.com/inventory/page/2",
    );
  });

  it("DealerFire: SearchResultsPage offers with serialNumber VINs", () => {
    const s = site({
      url: "https://www.soniasautosales.com",
      state: "MA",
      platform: "dealerfire",
    });
    const html = ld({
      "@type": "SearchResultsPage",
      offers: [
        {
          "@type": "Offer",
          name: "2013 Toyota RAV4 Limited",
          serialNumber: "2T3DFREV6DW081421",
          url: "https://www.soniasautosales.com/vehicle-details/used-2013-toyota-rav4-limited-worcester-ma-id-66047634",
          seller: { "@type": "AutoDealer", name: "Sonia's" },
          itemOffered: {
            "@type": "Product",
            name: "2013 Toyota RAV4 Limited",
            brand: { "@type": "Brand", name: "Toyota" },
            model: "RAV4",
            vehicleModelDate: 2013,
            offers: [
              { "@type": "AggregateOffer", lowPrice: 9498, price: 9498 },
            ],
            image: "https://cdn-ds.com/stock/a.jpg",
          },
          price: 9498,
        },
      ],
    });
    const [deal] = parse(s, html).cards.map((c) => cardToDeal(c, s));
    expect(deal).toMatchObject({
      make: "Toyota",
      model: "RAV4",
      year: 2013,
      ask_price: 9498,
      vin: "2T3DFREV6DW081421",
      images: ["https://cdn-ds.com/stock/a.jpg"],
    });
  });

  it("space.auto: @graph SearchResultsPage → mainEntity ItemList of Product/Car", () => {
    const s = site({
      url: "https://www.choiceautohawaii.com",
      state: "HI",
      platform: "spaceauto",
    });
    const html = ld({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": ["WebPage", "CollectionPage", "SearchResultsPage"],
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: 204,
            itemListElement: [
              {
                "@type": "ListItem",
                url: "https://www.choiceautohawaii.com/vehicle/used-2023-audi-a4-45-s-line-premium-plus-waueaaf45pn002095/",
                item: {
                  "@type": ["Product", "Car"],
                  name: "2023 Audi A4",
                  sku: "WAUEAAF45PN002095",
                  brand: { "@type": "Brand", name: "Audi" },
                  vehicleModelDate: "2023",
                  mileageFromOdometer: {
                    "@type": "QuantitativeValue",
                    value: 34992,
                  },
                  offers: {
                    "@type": "Offer",
                    price: "25500",
                    availability: "https://schema.org/InStock",
                  },
                },
              },
            ],
          },
        },
        { "@type": "AutoDealer", name: "Choice Automotive" },
      ],
    });
    const [deal] = parse(s, html).cards.map((c) => cardToDeal(c, s));
    expect(deal).toMatchObject({
      make: "Audi",
      year: 2023,
      ask_price: 25500,
      mileage: 34992,
      location_state: "HI",
    });
    expect(deal!.source_url).toContain("/vehicle/used-2023-audi-a4");
  });

  it("ProMax: list Vehicle JSON-LD has no url, so the detail link is matched by sku", () => {
    const s = site({
      url: "https://www.bandlcars.com",
      state: "SC",
      platform: "promax",
    });
    const html = `<a href="//www.bandlcars.com/VehicleDetails/11361/15149/West-Columbia-SC-2018-Ford-USED">x</a>${ld(
      {
        "@context": "http://schema.org/",
        "@type": "Vehicle",
        mileageFromOdometer: "148500",
        vehicleIdentificationNumber: "1FT7W2BT6JEB70187",
        brand: "Ford",
        model: "Super Duty F-250 SRW",
        offers: { "@type": "Offer", price: "39500" },
        sku: "15149",
        image: "https://imageserver.promaxinventory.com/11361/image/e.jpg",
        name: "2018 Ford Super Duty F-250 SRW 4WD Crew Cab Box",
      },
    )}`;
    const [deal] = parse(s, html).cards.map((c) => cardToDeal(c, s));
    expect(deal).toMatchObject({
      year: 2018,
      make: "Ford",
      ask_price: 39500,
      mileage: 148500,
      vin: "1FT7W2BT6JEB70187",
      source_url:
        "https://www.bandlcars.com/VehicleDetails/11361/15149/West-Columbia-SC-2018-Ford-USED",
    });
  });

  it("vinFromUrl only takes a real VIN-shaped slug segment", () => {
    expect(
      vinFromUrl(
        "https://x.com/inventory/2023-ford-mustang-ecoboost-premium-1FA6P8TH1P5107986",
      ),
    ).toBe("1FA6P8TH1P5107986");
    expect(
      vinFromUrl(
        "https://x.com/inventory/used-2016-chevrolet-malibu-ls-sedan-4d",
      ),
    ).toBeUndefined();
  });
});

describe("HTML platforms", () => {
  it("Legible: flight payload, only the Frederick lot", () => {
    const s = site({
      url: "https://www.rennkirbyfrederick.com",
      state: "MD",
      platform: "legible",
      lot: "frederick",
    });
    const obj = (id: string, lot: string, price: number) =>
      `{\\"id\\":\\"${id}\\",\\"stock\\":\\"${id}\\",\\"vin\\":\\"4S3GTAT66P370234${id.length}\\",\\"year\\":\\"2023\\",\\"make\\":\\"Subaru\\",\\"model\\":\\"Impreza\\",\\"trim\\":\\"Limited\\",\\"title\\":\\"2023 SUBARU Impreza Limited\\",\\"price\\":${price},\\"mileage\\":46475,\\"url\\":\\"https://www.rennkirbyfrederick.com/vehicle/${id}/2023-SUBARU-IMPREZA-LIMITED/?ref=dealer_site\\",\\"photos\\":[\\"https://www.rennkirbyfrederick.com/media/a.jpg\\"],\\"isSiblingLot\\":false,\\"lotKey\\":\\"${lot}\\"}`;
    const html = `<script>self.__next_f.push([1,"[${obj("U8415", "frederick", 22000)},${obj("K1", "kia", 30000)},${obj("C2", "charles-town", 9000)}]"])</script>`;
    const deals = parse(s, html).cards.map((c) => cardToDeal(c, s));
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      title: "2023 Subaru Impreza Limited",
      ask_price: 22000,
      mileage: 46475,
      source_url:
        "https://www.rennkirbyfrederick.com/vehicle/U8415/2023-SUBARU-IMPREZA-LIMITED/",
    });
  });

  it("ADIMS: onclick detail links, sold badges and call-for-price (MSRP is not a price)", () => {
    const s = site({
      url: "https://davidcarstn.com",
      state: "TN",
      platform: "adims",
    });
    const card = (vid: number, title: string, price: string, extra = "") => `
      <ul class="invent-grid" onclick="openlinkinnewtab('/detail/?vid=${vid}')"><li>
        <span>${title}</span>${extra}
        <img src="https://www.adimsweb.com/Pictures/${vid}/web/a.jpg">
        <span>Sale Price </span><span>${price}</span>
        <span class="url"><span>${title}</span></span>
        <strong>Mileage:</strong><span>153,400</span> VIN: 1G11F5S1XFF126176 Stock #: 1125
      </li></ul>`;
    const html = `<body>3 Items Matching: Page 1 of 1
      ${card(32683, "2015 CHEVROLET MALIBU", "$5,000")}
      ${card(1, "2001 CHEVROLET EXPRESS", "$580", '<img src="https://davidcarstn.com/wp-content/themes/x/images/sold.png">')}
      ${card(2, "2004 CHEVROLET SILVERADO 1500", "Call Us MSRP $1,200")}</body>`;
    const deals = parse(s, html).cards.map((c) => cardToDeal(c, s));
    expect(deals[0]).toMatchObject({
      title: "2015 CHEVROLET MALIBU",
      ask_price: 5000,
      mileage: 153400,
      vin: "1G11F5S1XFF126176",
      source_url: "https://davidcarstn.com/detail/?vid=32683",
      images: ["https://www.adimsweb.com/Pictures/32683/web/a.jpg"],
    });
    expect(deals[1]).toBeNull(); // sold badge
    expect(deals[2]).toBeNull(); // call for price
  });

  it("Wix: unlinked text blocks ('Price: $X ... Mileage: N')", () => {
    const s = site({
      url: "https://www.mbautosalesms.com",
      state: "MS",
      platform: "wix",
    });
    const html = `<body><p>Inventory</p>
      <p>2021 Hyundai Sonata Se Price: $14,500 Exterior: Blue Mileage: 46,100 INQUIRE</p>
      <p>2008 Jeep Patriot Price: $5,900 Transmission: 5 Speed Manual Mileage: 78 ,000 INQUIRE</p></body>`;
    const deals = parse(s, html).cards.map((c) => cardToDeal(c, s));
    expect(deals.map((d) => [d!.title, d!.ask_price, d!.mileage])).toEqual([
      ["2021 Hyundai Sonata Se", 14500, 46100],
      ["2008 Jeep Patriot", 5900, 78000],
    ]);
    expect(deals[0]!.source_url).toBe(
      "https://www.mbautosalesms.com/inventory",
    );
  });

  it("cars and trucks only: a dealer's ATV never becomes a deal", () => {
    const s = site({
      url: "https://www.307motors.com",
      state: "WY",
      platform: "dealrcloud",
    });
    const html = `<div><a href="inventory/2026-yamaha-grizzly-/1194455">2026 Yamaha Grizzly</a> $9,999</div>
      <div><a href="inventory/2021-chevrolet-equinox-awd-lt/1156322">2021 Chevrolet Equinox AWD LT</a> $14,900 91,870 miles</div>`;
    const deals = parse(s, html)
      .cards.map((c) => cardToDeal(c, s))
      .filter(Boolean);
    expect(deals.map((d) => d!.title)).toEqual([
      "2021 Chevrolet Equinox AWD LT",
    ]);
  });
});

/** A PoliteCrawler over an in-memory site: real robots.txt handling, no waiting. */
function fakeSite(pages: Record<string, string>, robots: string) {
  const requested: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    requested.push(url);
    if (url.endsWith("/robots.txt"))
      return new Response(robots, { status: 200 });
    const body = pages[url];
    return body === undefined
      ? new Response("not found", { status: 404 })
      : new Response(body, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
  };
  const sleep = async () => {};
  const crawler = new PoliteCrawler({
    fetchImpl,
    sleep,
    cache: new MemoryPageCache(),
    limiter: new DomainLimiter({ minGapMs: 0, sleep, random: () => 0 }),
  });
  const logs: string[] = [];
  const deps: DealerCmsDeps = {
    fetchHtml: (u) => crawler.fetch(u),
    load: (h) => cheerio.load(h),
    log: (m) => logs.push(m),
  };
  return { requested, deps, logs };
}

// CARMART's live robots.txt (2026-10-10).
const CARMART_ROBOTS = `User-agent: *
Disallow: /*highlights[]=
Allow: /
Allow: /inventory/
`;

describe("robots.txt is checked before any link is followed (politeFetch)", () => {
  const carmart = site({
    url: "https://www.carmartde.com",
    platform: "overfuel",
  });

  it("CARMART: /inventory?highlights[]= is disallowed, in either spelling, and never requested", async () => {
    expect(
      robotsAllows(
        CARMART_ROBOTS,
        "https://www.carmartde.com/inventory?highlights[]=Apple%20CarPlay",
      ),
    ).toBe(false);
    expect(
      robotsAllows(
        CARMART_ROBOTS,
        "https://www.carmartde.com/inventory?highlights%5B%5D=Apple%20CarPlay",
      ),
    ).toBe(false);
    expect(
      robotsAllows(
        CARMART_ROBOTS,
        "https://www.carmartde.com/inventory/page/2",
      ),
    ).toBe(true);

    // The facet links sit on page 1; and if a page ever advertises one as its "next" page, the
    // crawler stops there instead of fetching it.
    const facetNext =
      "https://www.carmartde.com/inventory?highlights[]=Apple%20CarPlay";
    const { requested, deps, logs } = fakeSite(
      {
        "https://www.carmartde.com/inventory": OVERFUEL_PAGE(
          3,
          "https://www.carmartde.com/inventory/page/2",
        ),
        "https://www.carmartde.com/inventory/page/2": OVERFUEL_PAGE(
          4,
          facetNext,
        ),
      },
      CARMART_ROBOTS,
    );
    const deals = await crawlDealerCms(carmart, deps);
    expect(deals).toHaveLength(2); // one live car per page; the SoldOut ones are skipped
    expect(requested).toEqual([
      "https://www.carmartde.com/robots.txt",
      "https://www.carmartde.com/inventory",
      "https://www.carmartde.com/inventory/page/2",
    ]);
    expect(requested.some((u) => /highlights/i.test(u))).toBe(false);
    expect(logs.join(" ")).toContain("stopped at robots-disallowed");
  });

  it("a robots-disallowed pagination link is not followed", async () => {
    const { requested, deps } = fakeSite(
      {
        "https://www.carmartde.com/inventory": OVERFUEL_PAGE(
          3,
          "https://www.carmartde.com/inventory/page/2",
        ),
        "https://www.carmartde.com/inventory/page/2": OVERFUEL_PAGE(4),
      },
      `User-agent: *\nDisallow: /inventory/page/\n`,
    );
    const deals = await crawlDealerCms(carmart, deps);
    expect(deals).toHaveLength(1);
    expect(requested).not.toContain(
      "https://www.carmartde.com/inventory/page/2",
    );
  });

  it("never follows a next link to another host", async () => {
    const { requested, deps } = fakeSite(
      {
        "https://www.carmartde.com/inventory": OVERFUEL_PAGE(
          3,
          "https://evil.example/inventory/page/2",
        ),
      },
      "User-agent: *\nAllow: /\n",
    );
    await crawlDealerCms(carmart, deps);
    expect(requested.some((u) => u.includes("evil.example"))).toBe(false);
  });

  it("ProMax sitemap mode: detail pages from sitemap.xml, robots-disallowed ones skipped", async () => {
    const s = site({
      url: "https://www.bandlcars.com",
      state: "SC",
      platform: "promax",
    });
    const detail = (sku: string, vin: string) =>
      ld({
        "@type": ["Product", "Car"],
        name: "2020 Chevrolet Tahoe 4d SUV 4WD LT",
        vehicleIdentificationNumber: vin,
        sku,
        brand: { name: "Chevrolet" },
        offers: { price: 28745 },
      });
    const base = "https://www.bandlcars.com/VehicleDetails/11361";
    const { requested, deps } = fakeSite(
      {
        "https://www.bandlcars.com/inventory":
          "<html><body>99 Results</body></html>",
        "https://www.bandlcars.com/sitemap.xml": `<urlset><url><loc>${base}/1/a-USED</loc></url><url><loc>${base}/2/b-USED</loc></url><url><loc>https://www.bandlcars.com/about</loc></url></urlset>`,
        [`${base}/1/a-USED`]: detail("1", "1GNSKBKC1LR150678"),
        [`${base}/2/b-USED`]: detail("2", "1GNSKBKC1LR150679"),
      },
      "User-agent: *\nDisallow: /VehicleDetails/11361/2/\n",
    );
    const deals = await crawlDealerCms(s, deps);
    expect(deals.map((d) => d.vin)).toEqual(["1GNSKBKC1LR150678"]);
    expect(deals[0].source_url).toBe(`${base}/1/a-USED`);
    expect(requested).not.toContain(`${base}/2/b-USED`);
    expect(requested).not.toContain("https://www.bandlcars.com/about");
  });

  it("sitemapDetailUrls keeps only matching detail pages", () => {
    expect(
      sitemapDetailUrls(
        "<loc>https://a.com/VehicleDetails/1/2/x</loc><loc>https://a.com/x</loc>",
        /\/VehicleDetails\/\d+\/(\d+)\//,
      ),
    ).toEqual(["https://a.com/VehicleDetails/1/2/x"]);
  });
});

describe("zero-source-state registry (Elle's audit 2026-10-10)", () => {
  const byHost = (h: string) =>
    CURATED_SITES.find(
      (s) => new URL(s.url).hostname.replace(/^www\./, "") === h,
    );
  const CLEAN = [
    "carmartde.com",
    "alohaautodepot.com",
    "choiceautohawaii.com",
    "843auto.com",
    "rennkirbyfrederick.com",
  ];
  const AWAITING = [
    "usedtrucksidahofalls.com",
    "soniasautosales.com",
    "helloautogs.com",
    "craftautosales.com",
    "mbautosalesms.com",
    "bandlcars.com",
    "davidcarstn.com",
    "summitautoexchange.com",
    "307motors.com",
  ];

  it("the 5 clean-terms dealers are enabled and parse with a platform config", () => {
    for (const h of CLEAN) {
      const s = byHost(h)!;
      expect(s, h).toBeDefined();
      expect(isCuratedSiteEnabled(s), h).toBe(true);
      expect(dealerCmsSiteFromCurated(s), h).toBeDefined();
    }
    expect(byHost("rennkirbyfrederick.com")!.lot).toBe("frederick");
  });

  it("the no-terms-page dealers are registered but off, awaiting Jonah's terms decision", () => {
    for (const h of AWAITING) {
      const s = byHost(h)!;
      expect(s, h).toBeDefined();
      expect(s.enabled, h).toBe(false);
      expect(isCuratedSiteEnabled(s), h).toBe(false);
      expect(s.termsNote, h).toMatch(/^awaiting Jonah terms decision/);
      expect(dealerCmsSiteFromCurated(s), h).toBeDefined(); // ready for a one-line flip
    }
  });

  it("excluded platforms stay out (Dealer.com/Cox terms, Elle's terms-ban list)", () => {
    for (const h of [
      "darlingsusedvehiclecenter.com",
      "charliespreowned.com",
      "earthycars.com",
      "akamaimotors.com",
      "a1autohawaii.com",
      "smhautos.com",
      "mileground.com",
    ])
      expect(byHost(h), h).toBeUndefined();
  });
});
