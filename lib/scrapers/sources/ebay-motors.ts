// lib/scrapers/sources/ebay-motors.ts
// eBay Motors (category 6001) — NOT Cloudflare-walled, so it fetches directly (no FlareSolverr).
// eBay redesigned the SRP away from .s-item to .s-card / .su-card-container; we parse THAT. eBay's
// search cards are thin (title + price; VIN/mileage live on the item page) and mix in promos/parts,
// so we filter hard: a real vehicle has a 4-digit year in the title + a vehicle-range price. The
// pipeline's normalizeDeal re-derives make/model from the title and gates unknown makes.

import type { Deal } from "@/types";
import * as cheerio from "cheerio";
import {
  paginate,
  extractPrice,
  extractMileage,
  type ScraperConfig,
} from "../engine";
import { upsertDeals } from "../pipeline";

export const EBAY_MOTORS_CONFIG: ScraperConfig = {
  name: "eBay Motors",
  baseUrl: "https://www.ebay.com",
  renderMode: "static",
  requestDelay: 2000,
  concurrency: 3,
  useProxies: true,
  stealth: false,
  maxPages: 8,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

const SEARCHES = [
  "ford f150",
  "chevrolet silverado",
  "ram 1500",
  "toyota tacoma",
  "jeep wrangler",
  "honda accord",
  "toyota camry",
  "bmw 3 series",
];

/** Parse an eBay Motors SRP into vehicle listing rows from the .s-card structure. */
export function parseEbayHtml(html: string): Partial<Deal>[] {
  const $ = cheerio.load(html);
  const items: Partial<Deal>[] = [];

  $(".s-card, li.su-card-container").each((_: number, el: any) => {
    const row = $(el);
    // eBay glues badge text ("New Listing"/"Sponsored") onto the title with no space — strip it,
    // and cut the "Opens in a new window…" accessibility suffix.
    const title = row
      .find(".s-card__title")
      .first()
      .text()
      .trim()
      .replace(/^(new listing|sponsored|top rated plus|featured)\s*/i, "")
      .replace(/opens in a new window.*$/i, "")
      .trim();
    if (!title || /shop on ebay|sponsored/i.test(title)) return;

    // Real vehicle: a 4-digit model year in the title (no \b — eBay concatenates tokens).
    const ym = title.match(/(19[5-9]\d|20[0-4]\d)/);
    if (!ym) return;
    const year = parseInt(ym[0], 10);

    const price = extractPrice(
      row.find(".s-card__price").first().text().trim(),
    );
    if (!price || price < 1000 || price > 300000) return; // filters parts/accessories

    const link =
      row.find("a.s-card__link").attr("href") ||
      row.find('a[href*="/itm/"]').first().attr("href") ||
      "";
    const itemId = link.match(/\/itm\/(\d+)/)?.[1] || "";
    if (!itemId) return;

    const subtitle = row
      .find(".s-card__subtitle, .su-card-container__attributes")
      .text()
      .trim();
    const img =
      row.find("img").first().attr("src") ||
      row.find("img").first().attr("data-src") ||
      "";

    // Rough year MAKE MODEL from the title; normalizeDeal re-derives authoritatively from the title.
    const after = title
      .slice((ym.index || 0) + 4)
      .trim()
      .split(/\s+/);
    const make = after[0] || "";
    const model = after.slice(1, 3).join(" ");

    items.push({
      source: "ebay_motors",
      source_deal_id: itemId,
      source_url: link.startsWith("http")
        ? link.split("?")[0]
        : `https://www.ebay.com${link}`,
      title,
      year,
      make,
      model,
      ask_price: price,
      mileage: extractMileage(subtitle),
      condition: "clean",
      images: img ? [img] : [],
      seller_type: "dealer",
      scraped_at: new Date().toISOString(),
    });
  });

  return items;
}

export async function scrapeEbayMotors(
  maxPagesPerSearch = EBAY_MOTORS_CONFIG.maxPages,
) {
  console.log("[eBay Motors] Starting scrape...");
  const allDeals: Partial<Deal>[] = [];

  for (const query of SEARCHES) {
    const config = { ...EBAY_MOTORS_CONFIG, maxPages: maxPagesPerSearch };
    const gen = paginate<Partial<Deal>>(
      config,
      (page) =>
        `https://www.ebay.com/sch/6001/i.html?_nkw=${encodeURIComponent(query)}` +
        `&_pgn=${page}&_ipg=120&_sop=10`,
      async (input) => {
        const html =
          typeof input === "string"
            ? input
            : ((input as any)?.html?.() ?? String(input));
        const items = parseEbayHtml(html);
        return { items, hasMore: items.length >= 20 };
      },
    );
    for await (const batch of gen) allDeals.push(...batch);
  }

  console.log(`[eBay Motors] Found ${allDeals.length} deals`);
  if (allDeals.length > 0) await upsertDeals(allDeals);
  return allDeals.length;
}
