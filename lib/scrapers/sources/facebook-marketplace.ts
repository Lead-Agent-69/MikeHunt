// lib/scrapers/sources/facebook-marketplace.ts
// ─── Facebook Marketplace scraper (requires login / heavy anti-bot) ───────────

import type { Deal } from "@/types";
import * as cheerio from "cheerio";
import {
  paginate,
  extractPrice,
  extractMileage,
  extractYear,
  normalizeUrl,
  type ScraperConfig,
} from "../engine";
import { upsertDeals } from "../pipeline";

export const FACEBOOK_MARKETPLACE_CONFIG: ScraperConfig = {
  name: "Facebook Marketplace",
  baseUrl: "https://www.facebook.com/marketplace",
  renderMode: "adaptive",
  requestDelay: 4000,
  concurrency: 1,
  useProxies: true,
  stealth: true,
  maxPages: 20,
  headers: { "Accept-Language": "en-US,en;q=0.9" },
};

const SEARCHES = [
  "ford f150",
  "chevrolet silverado",
  "toyota camry",
  "honda civic",
  "bmw",
  "jeep wrangler",
];

export async function scrapeFacebookMarketplace(
  searches: string[] = SEARCHES,
  maxPagesPerSearch = 3,
) {
  console.log("[Facebook Marketplace] Starting scrape...");
  const allDeals: Partial<Deal>[] = [];

  for (const query of searches) {
    const config = {
      ...FACEBOOK_MARKETPLACE_CONFIG,
      maxPages: maxPagesPerSearch,
    };
    const gen = paginate<Partial<Deal>>(
      config,
      (page) =>
        `https://www.facebook.com/marketplace/vehicles/search/?query=${encodeURIComponent(query)}`,
      async (input) => {
        const $ = typeof input === "string" ? cheerio.load(input) : input;
        const items: Partial<Deal>[] = [];

        $('div[data-testid="marketplace-search-item"]').each(
          (_: number, el: any) => {
            const row = $(el);
            const title = row
              .find('span[data-testid="marketplace-search-item-title"]')
              .text()
              .trim();
            if (!title) return;

            const priceText = row
              .find('span[data-testid="marketplace-search-item-price"]')
              .text()
              .trim();
            const price = extractPrice(priceText);
            if (!price) return;

            const locationText = row
              .find('span[data-testid="marketplace-search-item-location"]')
              .text()
              .trim();
            const descriptionText = row
              .find('div[data-testid="marketplace-search-item-description"]')
              .text()
              .trim();
            const link = row.find('a[href*="/marketplace/item/"]').attr("href");
            const imgSrc = row
              .find('img[data-testid="marketplace-search-item-image"]')
              .attr("src");
            const itemId =
              link?.split("/marketplace/item/")[1]?.split("/")[0] || "";

            items.push({
              source: "facebook_marketplace",
              source_deal_id: itemId,
              source_url: link
                ? normalizeUrl(link, "https://www.facebook.com")
                : "",
              title,
              year: extractYear(title),
              make: title.split(" ")[1] || "",
              model: title.split(" ").slice(2, 4).join(" ") || "",
              ask_price: price,
              mileage: extractMileage(descriptionText),
              condition: "clean",
              location_city: locationText,
              images: imgSrc ? [imgSrc] : [],
              description: descriptionText,
              seller_type: "private",
              scraped_at: new Date().toISOString(),
            });
          },
        );

        // Facebook uses infinite scroll; advance only while a page still yields items.
        const hasMore = items.length > 0 && config.maxPages > 1;
        return { items, hasMore };
      },
    );

    for await (const batch of gen) {
      allDeals.push(...batch);
    }
  }

  console.log(
    `[Facebook Marketplace] Found ${allDeals.length} deals (requires active login for live data)`,
  );
  await upsertDeals(allDeals);
  return allDeals.length;
}
