import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { CURATED_SITES, SITE_TYPE_DEFAULTS } from "../curated-sites";
import { selectCuratedSitesForDemand } from "../curated-rotation";
import { matchesRequestedDealer } from "@/lib/sources/source-meta";
import {
  cardToDeal,
  crawlDealerCms,
  dealerCmsSiteFor,
  parseListingPage,
  titleBrand,
} from "./dealer-cms";

const site = dealerCmsSiteFor("https://www.x2builders.com")!;

// X2's published ASP inventory uses spans, not heading tags, for many long titles.
const card = (id: number, title: string, price = "$29,900") => `
  <article>
    <div><div id="watermark_box"><a href="item.asp?page_id=item&amp;id=${id}">
      <img src="../pictures/${id}.jpg" alt="${title}"></a>
      <img src="images/clear.gif" class="watermark" alt="Watermark image">
    </div></div>
    <div><span class="car-year-parts">${title}</span></div>
    <span class="car-price-parts">${price}</span>
    <span class="car-mileage-parts">2,122 Miles</span>
    <span class="car-stock">stock: #A24542</span>
  </article>`;

describe("X2's scoped repairable inventory", () => {
  it("connects the neighboring Illinois rebuilder's full inventory, not its parts catalog", () => {
    const entry = CURATED_SITES.find((s) =>
      s.url.includes("billsmithauto.com"),
    )!;
    const config = dealerCmsSiteFor(entry.url)!;
    expect(config.inventoryUrl).toBe(entry.inventoryUrl);
    expect(matchesRequestedDealer(entry, [config.sourceId])).toBe(true);
    const parsed = parseListingPage(
      load(`
      <article><a href="/used-2024-buick-allure-sport-touring-v6438671.html">
      <img src="/photos/buick.jpg"><h3>2024 Buick Allure Sport Touring</h3></a>
      <p>VIN #: KL47LBE22RB216777</p><p>Mileage: 31,152 miles</p><p>$21,195</p></article>`),
      config.inventoryUrl,
      [config.detailPattern!],
    );
    expect(cardToDeal(parsed.cards[0], config)).toMatchObject({
      ask_price: 21195,
      mileage: 31152,
      condition: "unknown",
      location_state: "IL",
      vin: "KL47LBE22RB216777",
    });
  });
  it("joins Missouri's surrounding-state demand ring with selectable identity", () => {
    const entry = CURATED_SITES.find((s) => s.name === "X2 Builders")!;
    expect(entry).toMatchObject({ state: "IL", city: "Pontoon Beach" });
    expect(entry.inventoryUrl).toBe(site.inventoryUrl);
    expect(matchesRequestedDealer(entry, [site.sourceId])).toBe(true);
    expect(
      selectCuratedSitesForDemand(
        CURATED_SITES,
        { version: 1, lastAttempted: {} },
        ["MO"],
      ),
    ).toContain(entry);
  });

  it("reads the seller's long span heading, full price, mileage and actual photo", () => {
    const parsed = parseListingPage(
      load(
        card(
          3725,
          "2025 Ford F550 Mechanics Truck Crane Service Utility Truck Stellar",
        ),
      ),
      site.inventoryUrl,
      [site.detailPattern!],
    );
    expect(parsed.cards).toHaveLength(1);
    expect(cardToDeal(parsed.cards[0], site)).toMatchObject({
      source_deal_id: "dealer-x2builders-com-3725",
      title:
        "2025 Ford F550 Mechanics Truck Crane Service Utility Truck Stellar",
      year: 2025,
      make: "Ford",
      model: "F550 Mechanics Truck",
      ask_price: 29900,
      mileage: 2122,
      condition: "unknown",
      images: ["https://x2builders.com/pictures/3725.jpg"],
      location_state: "IL",
      location_city: "Pontoon Beach",
    });
  });

  it("keeps clean, rebuilt, pending-title and unstated stock separate", async () => {
    const rows = await crawlDealerCms(site, {
      load,
      fetchHtml: async () => ({
        ok: true,
        status: 200,
        body: [
          card(1, "2025 Ford F-150 CLEAN TITLE"),
          card(2, "2011 GMC Terrain CLEAR REBUILT TITLE"),
          card(3, "2020 Chevrolet Spark WAITING ON REBUILT TITLE"),
          card(4, "2018 Chevrolet Trax LS"),
          card(5, "2022 Toyota Camry", "Down payment $2,000"),
          card(6, "2021 Honda Civic", "SOLD"),
        ].join(""),
      }),
    });
    expect(rows.map((row) => row.condition)).toEqual([
      "clean_title",
      "rebuilt_title",
      "unknown",
      "unknown",
    ]);
    expect(rows.every((row) => row.images?.length)).toBe(true);
    expect(rows.every((row) => row.source_url?.startsWith(site.baseUrl))).toBe(
      true,
    );
  });
});

describe("title evidence is not dealer specialization", () => {
  it.each([
    "salvage_yard",
    "rebuilder_dealer",
    "auction_proxy",
    "clean_retail",
  ] as const)("%s does not manufacture a title brand", (type) =>
    expect(SITE_TYPE_DEFAULTS[type].condition).toBeUndefined(),
  );

  it("does not turn cleaning descriptions into clean-title evidence", () => {
    for (const text of [
      "Clean interior",
      "Clear coat damage",
      "Clean Carfax",
      "Runs and drives",
    ])
      expect(titleBrand(text)).toBeUndefined();
    expect(titleBrand("Title Clean")).toBe("clean_title");
    expect(titleBrand("Clean title, front damage")).toBe("clean_title");
    expect(titleBrand("Parts only salvage title")).toBe("parts_only");
    expect(titleBrand("Salvage rebuilt title")).toBe("rebuilt_title");
  });

  it.each([
    "Waiting on rebuilt title",
    "Awaiting title",
    "Rebuilt title pending",
  ])("does not assert completed paperwork: %s", (text) =>
    expect(titleBrand(text)).toBe("unknown"),
  );

  it("ignores legacy site-wide clean/rebuilt defaults when the card is silent", () => {
    const parsed = parseListingPage(
      load(card(1, "2020 Ford Escape")),
      site.inventoryUrl,
      [site.detailPattern!],
    );
    for (const defaultCondition of [
      "clean_title",
      "rebuilt_title",
      "salvage_title",
      "run_drive",
    ])
      expect(
        cardToDeal(parsed.cards[0], { ...site, defaultCondition })?.condition,
      ).toBe("unknown");
  });
});
