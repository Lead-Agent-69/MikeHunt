// lib/scrapers/sources/carparts.ts
// ─── CarParts.com salvage parts scraper for teardown opportunities ──────────

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

export const CARPARTS_CONFIG: ScraperConfig = {
  name: "CarParts.com",
  baseUrl: "https://www.carparts.com",
  renderMode: "static", // CarParts is mostly static HTML
  requestDelay: 2500,
  concurrency: 2,
  useProxies: false, // Less aggressive site
  stealth: false,
  maxPages: 20, // Lots of parts inventory
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
};

export async function scrapeCarParts(
  searchTerm = "salvage",
  maxPages = CARPARTS_CONFIG.maxPages,
) {
  console.log(`[CarParts.com] Starting scrape for "${searchTerm}"...`);
  const allDeals: Partial<Deal>[] = [];

  const config = { ...CARPARTS_CONFIG, maxPages };
  const gen = paginate<Partial<Deal>>(
    config,
    (page) =>
      `https://www.carparts.com/search?q=${encodeURIComponent(searchTerm)}&page=${page}`,
    async (input) => {
      const $ = typeof input === "string" ? cheerio.load(input) : input;
      const items: Partial<Deal>[] = [];

      // CarParts.com product listings
      $(
        'div.product-item, .product-card, [data-testid="product-card"], .search-result-item',
      ).each((_: number, el: any) => {
        const row = $(el);

        // Extract product title (often includes year/make/model)
        const title = row
          .find(
            'h2.product-title, .product-title, h3.product-name, [data-testid="product-title"], a.product-link',
          )
          .text()
          .trim();
        if (!title) return;

        // Extract price
        const priceText = row
          .find(
            'span.price, .product-price, [data-testid="price"], .sale-price, .current-price',
          )
          .text()
          .trim();
        const price = extractPrice(priceText);
        if (!price) return;

        // Extract additional details
        const descriptionText = row
          .find(
            '.product-description, .description, [data-testid="description"]',
          )
          .text()
          .trim();
        const partNumberText = row
          .find('.part-number, [data-testid="part-number"], .sku')
          .text()
          .trim();
        const conditionText = row
          .find('.condition, [data-testid="condition"], .item-condition')
          .text()
          .trim();
        const link =
          row.find('a[href*="/product/"], a.product-link').attr("href") ||
          row.find("a").first().attr("href");
        const imgSrc =
          row
            .find('img.product-image, img[alt*="product"], img')
            .first()
            .attr("src") || row.find("img").first().attr("data-src");
        const itemId =
          partNumberText || link?.split("/product/")[1]?.split("?")[0] || "";

        // Try to extract vehicle info from title or description
        const fullText = `${title} ${descriptionText}`.toLowerCase();
        const year = extractYear(title) || extractYear(descriptionText);

        // Parse make/model if present in title
        const titleParts = title.split(" ");
        let make = "";
        let model = "";

        // Common patterns: "2015 Honda Civic Engine" or "Engine for 2015 Honda Civic"
        if (year) {
          const yearIndex = titleParts.findIndex((p) =>
            p.includes(year.toString()),
          );
          if (yearIndex >= 0 && yearIndex < titleParts.length - 2) {
            make = titleParts[yearIndex + 1] || "";
            model = titleParts[yearIndex + 2] || "";
          }
        }

        // Determine if this is a salvage/used part (good for teardown ROI)
        const isSalvage =
          fullText.includes("salvage") ||
          fullText.includes("used") ||
          fullText.includes("recycled") ||
          fullText.includes("oem used") ||
          conditionText.toLowerCase().includes("used");

        // Only include salvage/used parts for teardown opportunities
        if (!isSalvage && !searchTerm.toLowerCase().includes("salvage")) return;

        items.push({
          source: "carparts",
          source_deal_id: itemId,
          source_url: link ? normalizeUrl(link, CARPARTS_CONFIG.baseUrl) : "",
          title,
          year,
          make,
          model,
          ask_price: price,
          condition: isSalvage ? "salvage" : "used",
          description: descriptionText.substring(0, 500), // Limit description length
          images: imgSrc ? [imgSrc] : [],
          seller_type: "private", // Parts sellers treated as private
          seller: "CarParts.com",
          metadata: {
            part_number: partNumberText || undefined,
            part_type: title
              .split(" ")
              .find((w) =>
                [
                  "engine",
                  "transmission",
                  "door",
                  "hood",
                  "bumper",
                  "fender",
                  "headlight",
                  "taillight",
                ].includes(w.toLowerCase()),
              ),
          },
          scraped_at: new Date().toISOString(),
        });
      });

      const hasMore =
        $(
          'a.next-page, button.load-more, [data-testid="next-page"], .pagination-next',
        ).length > 0;
      return { items, hasMore };
    },
  );

  for await (const batch of gen) {
    allDeals.push(...batch);
  }

  console.log(
    `[CarParts.com] Found ${allDeals.length} salvage parts for teardown analysis`,
  );

  if (allDeals.length > 0) {
    await upsertDeals(allDeals);
  }

  return allDeals.length;
}
