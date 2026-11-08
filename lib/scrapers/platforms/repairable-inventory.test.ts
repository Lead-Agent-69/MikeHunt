import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { crawlDealerCms, dealerCmsSiteFor } from "./dealer-cms";

const response = (body: string) => ({ ok: true, status: 200, body });
const vin = "1FTEX1EP0LFC26831";
const fordPhoto = `https://s3.amazonaws.com/gtPics/${vin}_19.jpeg`;

describe("direct repairable inventory", () => {
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
