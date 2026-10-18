import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  cardToDeal,
  crawlDealerCms,
  dealerCmsSiteFor,
  parseDgInventory,
} from "./dealer-cms";
import { dealerDetailPhotos } from "../dealer-detail-photos";
import { sourcePriceContext } from "@/lib/deals/source-price-context";

const site = dealerCmsSiteFor("https://dgautollc.com")!;
const slug = "/2022-ford-f250-platinum-fx4-4x4-1ft7w2bt3nec06696/";
// Trimmed native markup observed October 17, 2026. No calls to the source in tests.
const card = `<a class="card" href="${slug}" data-type="truck" data-title="salvage" data-damage="collision"
  data-make="Ford" data-year="2022" data-price="38900" data-miles="61876">
  <div><img src="/cmsAdmin/uploads/thumb/img-6653.jpg" alt="2022 Ford F250 Platinum FX4">
  <span class="badge">Salvage</span></div>
  <div><span>2022 Ford F250 <span>Platinum&nbsp;FX4</span></span>
  <span>Front-end collision · 61,876 mi · #C06696</span><span>$38,900</span></div></a>`;
const inventory = (cards = card, count = 1) =>
  `<span data-inv-count><strong>${count}</strong> of ${count} vehicles</span>
  <div data-inv-grid>${cards}</div>`;
const parse = (html: string) => parseDgInventory(load(html), site.inventoryUrl);

describe("D&G native inventory", () => {
  it("reads native self-contained cards without leaking neighbouring vehicles", () => {
    const page = parse(inventory());
    expect(page).toMatchObject({ total: 1, observed: 1, excluded: 0 });
    expect(cardToDeal(page.cards[0], site)).toMatchObject({
      source_deal_id: "dg-auto-1ft7w2bt3nec06696",
      source_url: `https://dgautollc.com${slug}`,
      title: "2022 Ford F250 Platinum FX4",
      vin: "1FT7W2BT3NEC06696",
      ask_price: 38900,
      mileage: 61876,
      condition: "salvage_title",
      title_source: "listing",
      damage_type: "collision",
      location_city: "Poplar Bluff",
      location_state: "MO",
    });
    expect(page.cards[0].stock).toBe("C06696");
    expect(page.cards[0].sold).toBe(false);
  });

  it("deduplicates edited slugs by validated VIN", () => {
    const page = parse(
      inventory(
        card + card.replace(slug, slug.replace("platinum", "platinum-fx")),
        2,
      ),
    );
    expect(page.cards).toHaveLength(1);
    expect(page.duplicates).toBe(1);
  });
  it("carries the verified native asking amount through to customer price classification", () => {
    const deal = cardToDeal(parse(inventory()).cards[0], site)!;
    const price = sourcePriceContext({
      source: deal.source,
      source_url: deal.source_url,
      ask_price: deal.ask_price,
      price_evidence: deal.options?.priceEvidence,
    });
    expect(price).toMatchObject({
      kind: "asking",
      amount: 38_900,
      cashPrice: 38_900,
      label: "Asking price",
    });
    // Other CMS layouts do not establish what their headline price means.
    const unverified = cardToDeal(parse(inventory()).cards[0], {
      ...site,
      layout: "cards",
    })!;
    expect(unverified.options?.priceEvidence).toBeUndefined();
  });

  it("excludes recreational carts rather than counting them as car coverage", () => {
    const cart = card.replace('data-type="truck"', 'data-type="recreational"');
    const page = parse(inventory(card + cart, 2));
    expect(page).toMatchObject({ observed: 2, total: 2, excluded: 1 });
    expect(page.cards).toHaveLength(1);
  });

  it("does not mistake savings, mismatched prices or call-for-price for asking prices", () => {
    for (const html of [
      card.replace("$38,900", "Savings $38,900"),
      card.replace('data-price="38900"', 'data-price="2180"'),
      card.replace("$38,900", "Call for price"),
      card
        .replace('data-price="38900"', 'data-price="0"')
        .replace("$38,900", "$0"),
    ]) {
      expect(cardToDeal(parse(inventory(html)).cards[0], site)).toBeNull();
    }
  });

  it("keeps title evidence separate from dealer assumptions and never asserts run status", () => {
    const clean = parse(
      inventory(card.replace('data-title="salvage"', 'data-title="clean"')),
    ).cards[0];
    expect(cardToDeal(clean, site)).toMatchObject({
      condition: "clean_title",
      title_source: "listing",
    });
    const unknown = parse(
      inventory(
        card.replace('data-title="salvage"', 'data-title="contact-dealer"'),
      ),
    ).cards[0];
    expect(cardToDeal(unknown, site)?.title_source).toBe("source_default");
    expect(cardToDeal(clean, site)).not.toHaveProperty("runs_drives");
    const undamaged = parse(
      inventory(card.replace('data-damage="collision"', 'data-damage="none"')),
    ).cards[0];
    expect(cardToDeal(undamaged, site)?.damage_type).toBe("none");
    const unstated = parse(
      inventory(card.replace('data-damage="collision"', 'data-damage=""')),
    ).cards[0];
    expect(cardToDeal(unstated, site)?.damage_type).toBeUndefined();
  });

  it("skips sold and on-hold cards, preserves zero miles and rejects impossible miles", () => {
    for (const label of ["Sold", "On Hold", "Sale pending"]) {
      const c = parse(
        inventory(
          card.replace('class="badge">Salvage', `class="badge">${label}`),
        ),
      ).cards[0];
      expect(c.sold).toBe(true);
      expect(cardToDeal(c, site)).toBeNull();
    }
    expect(
      parse(inventory(card.replace('data-miles="61876"', 'data-miles="0"')))
        .cards[0].mileage,
    ).toBe(0);
    expect(
      parse(
        inventory(card.replace('data-miles="61876"', 'data-miles="1000000"')),
      ).cards[0].mileage,
    ).toBeUndefined();
  });

  it("rejects off-site links and mismatched vehicle attributes", () => {
    expect(
      parse(inventory(card.replace(slug, `https://attacker.example${slug}`)))
        .cards,
    ).toEqual([]);
    expect(
      parse(inventory(card.replace('data-year="2022"', 'data-year="2050"')))
        .cards,
    ).toEqual([]);
    expect(
      parse(inventory(card.replace('data-make="Ford"', 'data-make="Kia"')))
        .cards,
    ).toEqual([]);
  });

  it("fetches the single complete inventory once, with explicit exclusion/rejection receipt", async () => {
    const fetched: string[] = [];
    const logs: string[] = [];
    const deals = await crawlDealerCms(site, {
      load,
      fetchHtml: async (url) => {
        fetched.push(url);
        return { ok: true, status: 200, body: inventory() };
      },
      log: (message) => logs.push(message),
    });
    expect(fetched).toEqual(["https://dgautollc.com/inventory/"]);
    expect(deals).toHaveLength(1);
    expect(logs.join("\n")).toContain(
      "observed 1, expected 1, parsed 1, excluded 0, duplicates 0, rejected 0",
    );
  });

  it.each([
    inventory(card, 156),
    "<html>New template</html>",
    inventory(card.replace('data-make="Ford"', 'data-make="Kia"')),
  ])("fails closed on incomplete or drifted inventory", async (html) => {
    await expect(
      crawlDealerCms(site, {
        load,
        fetchHtml: async () => ({ ok: true, status: 200, body: html }),
      }),
    ).rejects.toThrow("incomplete inventory");
  });

  it("reads all 18 published gallery views, not only the first five structured images", () => {
    const photos = [
      6653, 6652, 6654, 6655, 6656, 6651, 6661, 6662, 6663, 6664, 6665, 6666,
      6650, 6658, 6667, 6659, 6660, 6668,
    ];
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": ["Product", "Vehicle"],
      name: "2022 Ford F250 Platinum FX4",
      url: slug,
      image: photos.slice(0, 5).map((id) => `/cmsAdmin/uploads/img-${id}.jpg`),
    })}</script><img src="/logo.jpg"><div data-gallery>${photos
      .map(
        (id) =>
          `<button data-full="/cmsAdmin/uploads/img-${id}.jpg" hidden><img src="/cmsAdmin/uploads/thumb/img-${id}.jpg"></button>`,
      )
      .join("")}</div><div><img src="/related-car.jpg"></div>`;
    expect(dealerDetailPhotos(html, `https://dgautollc.com${slug}`)).toEqual(
      photos.map(
        (id) => `https://dgautollc.com/cmsAdmin/uploads/img-${id}.jpg`,
      ),
    );
  });
});
