import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { crawlDealerCms, dealerCmsSiteFor } from "./dealer-cms";

const response = (body: string) => ({ ok: true, status: 200, body });
const vin = "1FTEX1EP0LFC26831";
const fordPhoto = `https://s3.amazonaws.com/gtPics/${vin}_19.jpeg`;

describe("direct repairable inventory", () => {
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
      <div class="fl-row"><div class="fl-module-rich-text">Right side damage</div></div>
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
      description: "Right side damage",
    });
  });
});
