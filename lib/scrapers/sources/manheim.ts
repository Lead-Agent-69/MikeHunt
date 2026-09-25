// lib/scrapers/sources/manheim.ts
// ─── Manheim auction scraper (requires dealer account / API token) ──────────────

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

export const MANHEIM_CONFIG: ScraperConfig = {
  name: "Manheim",
  baseUrl: "https://www.manheim.com",
  renderMode: "browser", // Manheim requires JS rendering
  requestDelay: 4000, // Slower to avoid detection
  concurrency: 1,
  useProxies: true,
  stealth: true,
  maxPages: 10,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
};

export async function scrapeManheim(maxPages = MANHEIM_CONFIG.maxPages) {
  console.log("[Manheim] Starting scrape...");

  const allDeals: Partial<Deal>[] = [];
  const config = { ...MANHEIM_CONFIG, maxPages };

  const gen = paginate<Partial<Deal>>(
    config,
    (page) => `https://www.manheim.com/members/inventory/search?page=${page}`,
    async (input) => {
      const $ = typeof input === "string" ? cheerio.load(input) : input;
      const items: Partial<Deal>[] = [];

      // Manheim uses multiple possible selectors
      $(
        'div.vehicle-card, div.deal-item, .inventory-item, [data-testid="vehicle-card"], .search-result-item',
      ).each((_: number, el: any) => {
        const row = $(el);

        // Try multiple title selectors
        const title = row
          .find(
            'h3.vehicle-title, .vehicle-title, h2.vehicle-name, [data-testid="vehicle-title"], .ymmt',
          )
          .text()
          .trim();
        if (!title) return;

        // Try multiple price selectors
        const priceText = row
          .find(
            'span.bid-amount, .bid-amount, .current-bid, [data-testid="bid-amount"], .price-value',
          )
          .text()
          .trim();
        const price = extractPrice(priceText);
        if (!price) return;

        // Extract additional fields with fallbacks
        const mileageText = row
          .find(
            'span.vehicle-mileage, .vehicle-mileage, .odometer, [data-testid="mileage"]',
          )
          .text()
          .trim();
        const vinText = row
          .find(
            'span.vehicle-vin, .vehicle-vin, .vin-number, [data-testid="vin"]',
          )
          .text()
          .trim();
        const locationText = row
          .find(
            'span.vehicle-location, .vehicle-location, .location, [data-testid="location"]',
          )
          .text()
          .trim();
        const conditionText = row
          .find('.condition, .grade, [data-testid="condition"]')
          .text()
          .trim();
        const link =
          row
            .find('a[href*="/vehicle/"], a[href*="/inventory/"]')
            .attr("href") || row.find("a").first().attr("href");
        const imgSrc =
          row
            .find(
              'img.vehicle-photo, img.vehicle-image, img[alt*="vehicle"], img',
            )
            .first()
            .attr("src") || row.find("img").first().attr("data-src");
        const itemId =
          vinText ||
          link?.split("/vehicle/")[1]?.split("?")[0] ||
          link?.split("/inventory/")[1]?.split("?")[0] ||
          "";

        // Parse year/make/model from title
        const titleParts = title.split(" ");
        const year = extractYear(title);
        const make = titleParts[year ? 1 : 0] || "";
        const model =
          titleParts.slice(year ? 2 : 1, year ? 4 : 3).join(" ") || "";

        items.push({
          source: "manheim",
          source_deal_id: itemId,
          source_url: link ? normalizeUrl(link, MANHEIM_CONFIG.baseUrl) : "",
          title,
          year,
          make,
          model,
          vin: vinText,
          ask_price: price,
          mileage: extractMileage(mileageText),
          condition: conditionText.toLowerCase().includes("run")
            ? "runs"
            : conditionText.toLowerCase().includes("salvage")
              ? "salvage"
              : "clean",
          location_city: locationText.split(",")[0]?.trim() || locationText,
          location_state: locationText.split(",")[1]?.trim() || "",
          images: imgSrc ? [imgSrc] : [],
          seller_type: "auction",
          seller: "Manheim",
          scraped_at: new Date().toISOString(),
        });
      });

      const hasMore = $("a.next-page, a.pagination-next").length > 0;
      return { items, hasMore };
    },
  );

  for await (const batch of gen) {
    allDeals.push(...batch);
  }

  console.log(
    `[Manheim] Found ${allDeals.length} deals (requires dealer account for live inventory)`,
  );

  if (allDeals.length > 0) {
    await upsertDeals(allDeals);
  }

  return allDeals.length;
}
