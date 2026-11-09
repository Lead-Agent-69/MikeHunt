import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { crawlDealerCms, dealerCmsSiteFor } from "./dealer-cms";

const response = (body: string) => ({ ok: true, status: 200, body });
const vin = "1FTEX1EP0LFC26831";
const fordPhoto = `https://s3.amazonaws.com/gtPics/${vin}_19.jpeg`;

describe("direct repairable inventory", () => {
  it("walks Highway 12 pagination and rejects a matching down-payment amount", async () => {
    const site = dealerCmsSiteFor("https://highway12autosales.com")!;
    const card = (id: string) =>
      `<article><a href="/listings/${id}/"><h2>2020 Ford F-150</h2><img src="/stock/${id}.jpg"></a><p>$18,800</p></article>`;
    const fetchHtml = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/inventory/")
        return response(
          `${card("teaser")}<a class="next page-numbers" href="/inventory/page/2/">Next</a>`,
        );
      if (path === "/inventory/page/2/") return response(card("truck"));
      return response(`<div class="stm-single-car-page">
        <span data-cg-vin="${vin}" data-cg-price="18800"></span>
        ${path.includes("teaser") ? "Listed price is a down payment" : "Sale price $18,800"}
      </div>`);
    });
    const deals = await crawlDealerCms(site, { load, fetchHtml });
    expect(deals).toMatchObject([
      {
        source_deal_id: `highway-12-auto-${vin}`,
        ask_price: 18800,
        condition: "unknown",
        location_state: "AR",
        location_city: "Rogers",
        source_url: "https://highway12autosales.com/listings/truck/",
      },
    ]);
  });
  it("walks Legacy's inventory pages and keeps only photographed available stock", async () => {
    const site = dealerCmsSiteFor("https://legacymotorsjoplin.com")!;
    const photo = "https://legacymotorsjoplin.com/storage/1/vehicle.webp";
    const available = {
      status: "available",
      stock_number: "P-1",
      vin,
      year: 2020,
      make: "Ford",
      model: "F150",
      title: "2020 Ford F150 XLT",
      price: "18800.00",
      photos: [{ url: photo }],
      description: "Rebuilt transmission. Title paperwork pending.",
    };
    const fetchHtml = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return response(
        JSON.stringify({
          data:
            page === 1
              ? [{ ...available, status: "sold" }]
              : [available, { ...available, price: "3000.00", photos: [] }],
          meta: { current_page: page, last_page: 2 },
        }),
      );
    });
    const deals = await crawlDealerCms(site, { load, fetchHtml });
    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(deals).toMatchObject([
      {
        vin,
        condition: "unknown",
        ask_price: 18800,
        images: [photo],
        source_url: "https://legacymotorsjoplin.com/vehicles/P-1",
      },
    ]);
  });
  it("uses HRM's advertised special price and vehicle-specific title and photos", async () => {
    const site = dealerCmsSiteFor("https://hrmautollc.com")!;
    const photo = "https://hrmautollc.com/service/picture/19410/P-1/abc";
    const active = {
      forWeb: true,
      accountNo: "19410",
      stockNo: "P-1",
      vin,
      year: 2020,
      make: "Ford",
      model: "F150",
      mileage: 10929,
      price: "19900.00",
      specialPrice: "18800.00",
      downPayment: "1200.00",
      titleBranded: false,
      description: "<strong>Rebuilt Georgia Title</strong>",
      pictures: [
        { url: photo },
        { url: "https://hrmautollc.com/service/picture/19410/P-2/abc" },
      ],
    };
    const rows = [
      active,
      { ...active, soldOn: "2026-11-01", specialPrice: "123.00" },
      { ...active, forWeb: false, specialPrice: "456.00" },
    ];
    const deals = await crawlDealerCms(site, {
      load,
      fetchHtml: async () => response(JSON.stringify(rows)),
    });
    expect(deals).toMatchObject([
      {
        vin,
        condition: "rebuilt_title",
        title_source: "listing",
        ask_price: 18800,
        images: [photo],
        source_url: "https://hrmautollc.com/inventory/19410/view/P-1",
      },
    ]);
  });
  it("uses Connect Auto's matching paid-in-full amount instead of its financed price", async () => {
    const site = dealerCmsSiteFor("https://www.connectautosales.com")!;
    const photo =
      "https://jqsxtcudh1yt2y2i.public.blob.vercel-storage.com/vehicles/1/main-photos/f150.jpg";
    const card = `<div class="CarCard_card__abc">
      <a class="CarCard_imageWrap__abc" href="/inventory/123"><img src="/_next/image?url=${encodeURIComponent(photo)}"></a>
      <span class="CarCard_price__abc">$18,800</span>
      <span class="CarCard_mileage__abc">10,929 miles</span>
    </div>`;
    const detail = `<div><h1>2020 Ford F150 XLT</h1><span>Rebuilt Title</span></div>
      <span class="page_vinNum__abc">${vin}</span>
      <div><p class="page_cashPrice__abc">$18,800*</p><p class="page_priceNote__abc">Price in full</p></div>
      <p>$19,800 with financing</p>`;
    const crawl = (body: string) =>
      crawlDealerCms(site, {
        load,
        fetchHtml: async (url) =>
          response(url === site.inventoryUrl ? card : body),
      });
    expect(await crawl(detail)).toMatchObject([
      {
        vin,
        ask_price: 18800,
        condition: "rebuilt_title",
        images: [photo],
      },
    ]);
    expect(
      await crawl(detail.replace("Price in full", "With qualifying financing")),
    ).toEqual([]);
  });
  it("keeps 117 Auto's available rebuilt stock and drops the same VIN's stock-photo or sold row", async () => {
    const site = dealerCmsSiteFor("https://117autosales.com")!;
    const row = (
      status: string,
      alt: string,
      price: string,
    ) => `<article class="aiv-card ${status}">
      <div class="aiv-card-photo"><img alt="${alt}" src="/wp-content/uploads/car.jpg"></div>
      <h2 class="aiv-card-title"><a href="/inventory/f150/">2020 Ford F150 XLT</a></h2>
      <span class="aiv-title-badge">Rebuilt Title</span>
      <div class="aiv-price">${price}</div>
      <dl><dt>VIN</dt><dd>${vin}</dd><dt>Mileage</dt><dd>10,929 Miles</dd></dl>
    </article>`;
    const deals = await crawlDealerCms(site, {
      load,
      fetchHtml: async () =>
        response(
          row("", "Ford F150", "$18,800") +
            row("", "Stock photo", "$3,000") +
            row("is-sold", "Ford F150", "$2,000"),
        ),
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      vin,
      condition: "rebuilt_title",
      ask_price: 18800,
      mileage: 10929,
    });
  });

  it("reads Ridgeline title from the exact field and omits unavailable or mismatched photos", async () => {
    const site = dealerCmsSiteFor("https://ridgelineautomotivellc.com")!;
    const row = (
      status: string,
      photoVin: string,
      price: string,
    ) => `<article class="listing-item" data-status="${status}" data-vin="${vin}">
      <a class="listing-link" href="/inventory/f150/">Details</a>
      <span class="listing-title">2020 Ford F150 XLT</span>
      <img class="listing-image" src="/media/${photoVin}/vehicle.jpg">
      <span class="listing-price">${price}</span>
      <div class="detail-text"><span class="label">Title</span><span class="value">clean</span></div>
      <div class="detail-text"><span class="label">Mileage</span><span class="value">10,929 MI</span></div>
    </article>`;
    const deals = await crawlDealerCms(site, {
      load,
      fetchHtml: async () =>
        response(
          row("available", vin, "$18,800") +
            row("sold", vin, "$3,000") +
            row("available", "other", "$2,000"),
        ),
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      vin,
      condition: "clean_title",
      ask_price: 18800,
      mileage: 10929,
    });
  });
  it("reads D&A's stock rows without promoting sold or upcoming vehicles", async () => {
    const site = dealerCmsSiteFor("https://www.dandaauto.com")!;
    const row = (slug: string, sold = false) => `<tr>
      <td class="photo"><a href="/vehicle/${slug}/">
        ${sold ? '<img class="sold-ribbon">' : ""}
        <img class="attachment-tb_grid" src="/wp-content/uploads/${slug}.jpg">
      </a></td>
      <td class="title">2018 Chevrolet Equinox LT<br><span class="price">$9,000</span></td>
      <td class="description">Hail damage, 75k miles, salvage title.</td>
    </tr>`;
    const deals = await crawlDealerCms(site, {
      load,
      fetchHtml: async () =>
        response(`<ul><li>Upcoming SUV</li></ul>
        <table class="vehicles-archive">${row("available")}${row("sold", true)}</table>`),
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      source_deal_id: "danda-auto-available",
      title: "2018 Chevrolet Equinox LT",
      ask_price: 9000,
      mileage: 75000,
      condition: "salvage_title",
      title_source: "listing",
      images: ["https://www.dandaauto.com/wp-content/uploads/available.jpg"],
    });
  });

  it("uses Philips' matching as-is amount and VIN-specific photos only", async () => {
    const site = dealerCmsSiteFor("https://philipsrepairables.com")!;
    const post = (slug: string, copy: string, status = "") => `
      <div class="fl-post-feed-post ${status}">
        <h2 class="fl-post-title"><a href="/ford/${slug}/">2020 Ford F150 XLT</a></h2>
        $24995 Repaired Price ${copy} VIN: ${vin}
      </div>`;
    const inventory =
      post("available", "$18,800 as is") +
      post("repaired-only", "") +
      post("sold", "$18,800 as is", "tag-sold") +
      post("changed", "$17,900 as is");
    const detail = `<main id="fl-main-content">
      <h1>2020 Ford F150 XLT</h1>
      <div class="fl-row"><div class="s3-raw-gallery">
        <img src="${fordPhoto}"><img src="https://s3.amazonaws.com/gtPics/other.jpeg">
      </div></div>
      <div class="fl-row"><div class="fl-module-rich-text">Right side damage. Rebuilt transmission.</div></div>
      VIN: ${vin} Odometer: 10,929 $24,995 Repaired Price $18,800 as is
    </main>`;
    const fetchHtml = vi.fn(async (url: string) =>
      response(url === site.inventoryUrl ? inventory : detail),
    );
    const deals = await crawlDealerCms(site, { load, fetchHtml });
    expect(fetchHtml).toHaveBeenCalledTimes(3);
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      vin,
      ask_price: 18800,
      mileage: 10929,
      condition: "unknown",
      images: [fordPhoto],
      description: "Right side damage. Rebuilt transmission.",
    });
  });
});
