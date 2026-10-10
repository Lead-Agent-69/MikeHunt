import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";
import {
  DEALER_CMS_SITES,
  cardToDeal,
  crawlDealerCms,
  dealerCmsSiteFor,
  detailIdFromHref,
  pageUrlFor,
  parseListingPage,
  plannedPages,
  splitTitle,
  titleBrand,
} from "./dealer-cms";

// Trimmed copies of each template's card markup (structure as served 2026-10-09).
const DAMAGE = `
<ul class="pagination"><li class="active"><a href="#">page 1 of 6</a></li><li><a href="/vehiclesList.php?page=2">&raquo;</a></li></ul>
<div>Viewing 254 Results</div>
<div class="row cdg-mobi-results"><div class="col-xs-4"><a href="vehiclesDetail.php?15673"><img src="/cmsAdmin/uploads/0/thumb2/15673-0.jpg"></a><h4><u>$59,050</u></h4></div>
<div class="col-xs-8"><h4><a href="vehiclesDetail.php?15673"><strong>2023 Chevrolet <br> Camaro ZL1</strong></a></h4>
<p class="post-meta3"><time> 13,248 Mi | Rebuilt | #139282A</time></p><span class="rundrive-res">Run & Drive</span></div></div>
<div class="row cdg-mobi-results"><div class="col-xs-4"><a href="vehiclesDetail.php?15137"><img src="/x.jpg"></a><h4><u>$43,050</u></h4></div>
<div class="col-xs-8"><h4><a href="vehiclesDetail.php?15137"><strong>2023 Chevrolet <br> Suburban Premier 4X4</strong></a></h4>
<p class="post-meta3"><time> 41,720 Mi | Clear | #264328</time></p></div></div>
<div class="row cdg-mobi-results"><div class="col-xs-4"><a href="vehiclesDetail.php?15001"><img src="/y.jpg"></a><h4><u>$9,000</u></h4><span>SOLD</span></div>
<div class="col-xs-8"><h4><a href="vehiclesDetail.php?15001"><strong>2019 Ford <br> F-150 XLT</strong></a></h4>
<p class="post-meta3"><time> 88,000 Mi | Salvage | #1</time></p></div></div>`;

const DG = (ids: number[]) => `
<div><strong>264 Results</strong></div>
${ids
  .map(
    (
      id,
    ) => `<div class="col-sm-4"><div class="product-item"><div class="product-item__thumb"><a href="vehiclesDetail.php?${id}"><img src="/cmsAdmin/uploads/thumb/${id}.jpeg"></a>
<div class="product-item__sale"><span class="sale-txt">2024</span></div><div class="product-item__run-drive"><span class="sale-txt">Run & Drive</span></div></div>
<div class="product-item__content"><h4 class="title"><a href="vehiclesDetail.php?${id}"> GMC Sierra 2500HD SLT 4X4 </a></h4>
<span class="price"><strong>Price:</strong> $36,985</span><span class="cdg-stock">#: S${id}</span><span class="cdg-title">Salvage Title</span><span class="cdg-miles"> 32,825 Miles </span>
<div class="product-item__desc"><div class="text-line-2">Sold as-is. Easy build, light front hit, airbags are good, runs and drives great, call for more info.</div></div></div></div></div>`,
  )
  .join("")}
<a href="?page=2">2</a><a href="?page=11">11</a>`;

const POLECATS = `<div class="car-item"><a href="/vehiclesDetail.php?83"><div class="image"><img src="/cmsAdmin/uploads/thumb3/100-2539.jpg"></div>
<div class="content"><h5>2018 Chevrolet </h5><h6>Chevrolet Silverado Crew 4x4 LT</h6><p class="price"> $30,000 </p></div>
<div class="bottom"><ul class="car-meta"><li><i class="fa fa-cogs"></i> Repaired </li><li><i class="fa fa-tachometer"></i> 19,000 </li></ul></div></a></div>`;

const ELITE = `<div><p>24 results</p></div>
<div class="shop-card"><a href="vehiclesDetail.php?637"><img src="/cmsAdmin/uploads/thumb2/637-0.jpg"></a><a href="vehiclesDetail.php?637"><div class="shop-content"><h4>2014 Jeep</h4><h5>Wrangler Unlimited</h5><h6>Polar Edition</h6>
<p class="pricing"><span>Elite Price</span> $17,988 </p><ul><li>118,174 mi.</li><li>#E4919A</li></ul></div></a></div>
<div class="shop-card"><a href="vehiclesDetail.php?623"><img src="/a.jpg"></a><a href="vehiclesDetail.php?623"><div class="shop-content"><h4>1996 Chevrolet</h4><h5>SILVERADO C3500-V8</h5>
<p class="pricing"><span>Elite Price</span> $0 </p></div></a></div>`;

const SZONE = `<h4>55 results found</h4><div class="page-numbers"><a href="/repairable/salvage/rebuildables/2">2</a><a href="/repairable/salvage/rebuildables/6">6</a></div>
<div class='featured-item'><a href='/inventory/salvage/repairable/2024/CHEVROLET/9258'><img src='https://www.salvagezone.com/images/vehicles/9258.jpg'></a><div class='right-content'>
<a href='/inventory/salvage/repairable/2024/CHEVROLET/9258'><h2>2024 CHEVROLET EXPRESS 2500</h2></a><span class='inStock'>$19,900</span>
<p>Rebuilt title 2024 chevy express 2500 cargo van only 37k actual miles, powered by a 4.3l v6 engine and in very good running condition.</p>
<div class='car-info'><ul><li><i class='fa fa-file'></i>Rebuilt Title</li><li><i class='icon-road2'></i>37977</li><li>Stock # 9258</li></ul></div></div></div>
<div class='featured-item'><a href='/inventory/salvage/repairable/2022/CHEVROLET/9213'><img src='/b.jpg'></a><div class='right-content'>
<a href='/inventory/salvage/repairable/2022/CHEVROLET/9213'><h2>2022 CHEVROLET EXPRESS 2500 CARGO VAN</h2></a><span class='onHold'>On Hold</span>
<div class='car-info'><ul><li>Rebuilt Title</li><li><i class='icon-road2'></i>84752</li></ul></div></div></div>`;

const parse = (html: string, url = "https://www.example.com/vehicles.php") =>
  parseListingPage(cheerio.load(html), url);

describe("dealer CMS parser", () => {
  it("recognizes both detail-link styles", () => {
    expect(detailIdFromHref("vehiclesDetail.php?15673")).toBe("15673");
    expect(detailIdFromHref("/vehiclesDetail.php?ID=83")).toBe("83");
    expect(
      detailIdFromHref("/inventory/salvage/repairable/2024/CHEVROLET/9258"),
    ).toBe("9258");
    expect(detailIdFromHref("/contact.php")).toBeNull();
  });

  it("Damage.com: reads cards and the page count (the zero-result bug)", () => {
    const p = parse(DAMAGE, "https://www.damage.com/vehiclesList.php");
    expect(p.cards).toHaveLength(3);
    expect(p.total).toBe(254);
    expect(p.lastPage).toBe(6);
    const [camaro, suburban, sold] = p.cards;
    expect(camaro).toMatchObject({
      id: "15673",
      url: "https://www.damage.com/vehiclesDetail.php?15673",
      title: "2023 Chevrolet Camaro ZL1",
      year: 2023,
      make: "Chevrolet",
      price: 59050,
      mileage: 13248,
      condition: "rebuilt_title",
      stock: "139282A",
      image: "https://www.damage.com/cmsAdmin/uploads/0/thumb2/15673-0.jpg",
      sold: false,
    });
    expect(suburban.condition).toBe("clean_title");
    expect(sold.sold).toBe(true);
  });

  it("D&G: year badge + heading, salvage title, 'sold as-is' copy is not a SOLD badge", () => {
    const p = parse(DG([3299, 3300]), "https://www.dgautollc.com/vehicles.php");
    expect(p.total).toBe(264);
    expect(p.lastPage).toBe(11);
    expect(p.cards[0]).toMatchObject({
      title: "2024 GMC Sierra 2500HD SLT 4X4",
      year: 2024,
      make: "GMC",
      price: 36985,
      mileage: 32825,
      condition: "salvage_title",
      stock: "S3299",
      sold: false,
    });
  });

  it("Polecats: de-duplicates the repeated make; reads icon miles; 'Repaired' = rebuilt", () => {
    const [c] = parse(POLECATS).cards;
    expect(c.title).toBe("2018 Chevrolet Silverado Crew 4x4 LT");
    expect(c.mileage).toBe(19000);
    expect(c.condition).toBe("rebuilt_title");
  });

  it("Elite: multi-heading titles; $0 (call for price) cards are not saved", () => {
    const p = parse(ELITE, "https://www.elitesikeston.com/vehicles.php");
    expect(p.cards[0]).toMatchObject({
      title: "2014 Jeep Wrangler Unlimited Polar Edition",
      price: 17988,
      mileage: 118174,
    });
    expect(p.cards[1].price).toBeUndefined();
    const site = dealerCmsSiteFor("https://www.elitesikeston.com")!;
    expect(cardToDeal(p.cards[1], site)).toBeNull();
  });

  it("SalvageZone: path-style details and pages; On Hold is skipped", () => {
    const p = parse(
      SZONE,
      "https://www.salvagezone.com/repairable/salvage/rebuildables/1",
    );
    expect(p.total).toBe(55);
    expect(p.lastPage).toBe(6);
    expect(p.cards[0]).toMatchObject({
      id: "9258",
      title: "2024 CHEVROLET EXPRESS 2500",
      make: "Chevrolet",
      price: 19900,
      mileage: 37977,
      condition: "rebuilt_title",
      stock: "9258",
      sold: false,
    });
    expect(p.cards[1].sold).toBe(true);
  });

  it("title helpers", () => {
    expect(titleBrand("Prior salvage, now rebuilt")).toBe("rebuilt_title");
    expect(titleBrand("Clear")).toBe("clean_title");
    expect(titleBrand("Run & Drive")).toBeUndefined();
    expect(splitTitle("2030 NISSAN ALTIMA SV").year).toBeUndefined();
  });
});

describe("pagination (D&G showed 264, we stored 29)", () => {
  it("plans pages from the result count and the page links", () => {
    expect(
      plannedPages({ cards: new Array(24).fill({}), total: 264, lastPage: 11 }),
    ).toBe(11);
    expect(
      plannedPages({ cards: new Array(50).fill({}), total: 254, lastPage: 6 }),
    ).toBe(6);
    expect(
      plannedPages({
        cards: new Array(10).fill({}),
        total: 1000,
        lastPage: null,
      }),
    ).toBe(15);
    expect(plannedPages({ cards: [], total: null, lastPage: null })).toBe(1);
  });

  it("builds page URLs per platform", () => {
    const dg = dealerCmsSiteFor("https://dgautollc.com/")!;
    expect(pageUrlFor(dg, 1)).toBe("https://www.dgautollc.com/vehicles.php");
    expect(pageUrlFor(dg, 3)).toBe(
      "https://www.dgautollc.com/vehicles.php?page=3",
    );
    const sz = dealerCmsSiteFor("https://www.salvagezone.com")!;
    expect(pageUrlFor(sz, 4)).toBe(
      "https://www.salvagezone.com/repairable/salvage/rebuildables/4",
    );
  });

  it("walks every page and stops if the site ignores ?page=", async () => {
    const dg = dealerCmsSiteFor("https://www.dgautollc.com")!;
    const requested: string[] = [];
    const deals = await crawlDealerCms(dg, {
      load: (html) => cheerio.load(html),
      fetchHtml: async (url) => {
        requested.push(url);
        const page = Number(new URL(url).searchParams.get("page") || 1);
        const ids = Array.from({ length: 24 }, (_, i) => page * 1000 + i);
        return { ok: true, status: 200, body: DG(ids) };
      },
    });
    expect(requested).toHaveLength(11);
    expect(deals).toHaveLength(264);
    expect(deals[0]).toMatchObject({
      source: "independent_dealer",
      source_deal_id: "dg-auto-1000",
      location_state: "MO",
    });

    const loops: string[] = [];
    const same = await crawlDealerCms(dg, {
      load: (html) => cheerio.load(html),
      fetchHtml: async (url) => {
        loops.push(url);
        return { ok: true, status: 200, body: DG([1, 2, 3]) };
      },
    });
    expect(same).toHaveLength(3);
    expect(loops).toHaveLength(2);
  });

  it("fails loudly when the first page is refused (robots/breaker) instead of reporting 0", async () => {
    const dg = DEALER_CMS_SITES[0];
    await expect(
      crawlDealerCms(dg, {
        load: (html) => cheerio.load(html),
        fetchHtml: async () => ({
          ok: false,
          status: 0,
          body: "",
          skipped: "robots",
        }),
      }),
    ).rejects.toThrow(/robots/);
  });
});
