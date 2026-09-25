// lib/scrapers/sources/vroom.ts
// ─── Vroom scraper - Online dealer with nationwide delivery ───────────────────

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

export const VROOM_CONFIG: ScraperConfig = {
  name: "Vroom",
  baseUrl: "https://www.vroom.com",
  renderMode: "browser", // Next.js app
  requestDelay: 3000,
  concurrency: 1,
  useProxies: true,
  stealth: true,
  maxPages: 10,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

export async function scrapeVroom(
  searchTerm = "",
  maxPages = VROOM_CONFIG.maxPages,
) {
  console.log(`[Vroom] Starting scrape for "${searchTerm}"...`);
  const allDeals: Partial<Deal>[] = [];

  const config = { ...VROOM_CONFIG, maxPages };
  const gen = paginate<Partial<Deal>>(
    config,
    (page) => {
      const baseUrl = "https://www.vroom.com/inventory";
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        page: String(page),
      });
      return `${baseUrl}?${params.toString()}`;
    },
    async (input) => {
      const $ = typeof input === "string" ? cheerio.load(input) : input;
      const items: Partial<Deal>[] = [];

      // Vroom uses specific class names
      $('.vehicle-card, [data-testid="vehicle-card"], .inventory-card').each(
        (_: number, el: any) => {
          const row = $(el);

          // Extract title
          const title = row
            .find('.vehicle-title, [data-testid="vehicle-title"], h3')
            .text()
            .trim();
          if (!title) return;

          // Extract price
          const priceText = row
            .find('.vehicle-price, [data-testid="vehicle-price"], .price')
            .text()
            .trim();
          const price = extractPrice(priceText);
          if (!price) return;

          // Extract mileage
          const mileageText = row
            .find('.vehicle-mileage, [data-testid="mileage"], .mileage')
            .text()
            .trim();

          // Extract trim
          const trimText = row
            .find('.vehicle-trim, [data-testid="trim"], .trim')
            .text()
            .trim();

          // Extract link
          const link =
            row.find('a[href*="/inventory/"]').attr("href") ||
            row.find("a").first().attr("href");

          // Extract image
          const imgSrc =
            row
              .find('img[data-testid="vehicle-image"], img')
              .first()
              .attr("src") || row.find("img").first().attr("data-src");

          // Extract vehicle ID
          const vehicleId = link?.match(/\/inventory\/([^\/\?]+)/)?.[1] || "";

          // Parse year/make/model
          const titleParts = title.split(" ");
          const year = extractYear(title);
          const make = titleParts[year ? 1 : 0] || "";
          const model =
            titleParts.slice(year ? 2 : 1, year ? 4 : 3).join(" ") || "";

          // Extract condition report score (if available)
          const conditionScore = row
            .find('.condition-score, [data-testid="condition"]')
            .text()
            .trim();

          items.push({
            source: "vroom",
            source_deal_id: vehicleId,
            source_url: link ? normalizeUrl(link, VROOM_CONFIG.baseUrl) : "",
            title,
            year,
            make,
            model,
            trim: trimText,
            ask_price: price,
            mileage: extractMileage(mileageText),
            condition: "clean", // Vroom only sells clean title
            images: imgSrc ? [imgSrc] : [],
            seller_type: "dealer",
            seller: "Vroom",
            metadata: {
              delivery_available: true,
              seven_day_return: true,
              condition_score: conditionScore || undefined,
            },
            scraped_at: new Date().toISOString(),
          });
        },
      );

      const hasMore =
        $('button[aria-label="Next"], .pagination-next, [data-testid="next"]')
          .length > 0;
      return { items, hasMore };
    },
  );

  for await (const batch of gen) {
    allDeals.push(...batch);
  }

  console.log(`[Vroom] Found ${allDeals.length} deals`);

  if (allDeals.length > 0) {
    await upsertDeals(allDeals);
  }

  return allDeals.length;
}
