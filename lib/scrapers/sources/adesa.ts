// lib/scrapers/sources/adesa.ts
// ─── ADESA auction scraper (requires dealer account / API token) ────────────────

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

export const ADESA_CONFIG: ScraperConfig = {
  name: "ADESA",
  baseUrl: "https://www.adesa.com",
  renderMode: "browser", // ADESA requires JS rendering
  requestDelay: 4000, // Slower to avoid detection
  concurrency: 1,
  useProxies: true,
  stealth: true,
  maxPages: 10,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
};

export async function scrapeAdesa(maxPages = ADESA_CONFIG.maxPages) {
  console.log("[ADESA] Starting scrape...");

  // ADESA requires a dealer account. Attempt public lot search; if blocked, return 0.
  const allDeals: Partial<Deal>[] = [];
  const config = { ...ADESA_CONFIG, maxPages };

  const gen = paginate<Partial<Deal>>(
    config,
    (page) => `https://www.adesa.com/locations/public-sales?page=${page}`,
    async (input) => {
      const $ = typeof input === "string" ? cheerio.load(input) : input;
      const items: Partial<Deal>[] = [];

      // ADESA uses multiple possible selectors
      $(
        'div.auction-item, div.lot-card, .vehicle-deal, [data-testid="lot-card"], .search-result, .inventory-card',
      ).each((_: number, el: any) => {
        const row = $(el);

        // Try multiple title selectors
        const title = row
          .find(
            'h4.lot-title, .lot-title, h3.vehicle-title, [data-testid="vehicle-title"], .ymm, .vehicle-name',
          )
          .text()
          .trim();
        if (!title) return;

        // Try multiple price selectors
        const priceText = row
          .find(
            'span.current-bid, .current-bid, .bid-amount, [data-testid="bid-amount"], .price, .sale-price',
          )
          .text()
          .trim();
        const price = extractPrice(priceText);
        if (!price) return;

        // Extract additional fields with fallbacks
        const mileageText = row
          .find(
            'span.lot-mileage, .lot-mileage, .odometer, [data-testid="mileage"], .miles',
          )
          .text()
          .trim();
        const vinText = row
          .find(
            'span.lot-vin, .lot-vin, .vin, [data-testid="vin"], .vin-number',
          )
          .text()
          .trim();
        const locationText = row
          .find(
            'span.lot-location, .lot-location, .location, [data-testid="location"], .sale-location',
          )
          .text()
          .trim();
        const conditionText = row
          .find(
            '.condition, .grade, [data-testid="condition"], .vehicle-condition',
          )
          .text()
          .trim();
        const gradeText = row
          .find('.cr-grade, .grade-value, [data-testid="grade"]')
          .text()
          .trim();
        const link =
          row
            .find(
              'a[href*="/lot/"], a[href*="/vehicle/"], a[href*="/inventory/"]',
            )
            .attr("href") || row.find("a").first().attr("href");
        const imgSrc =
          row
            .find('img.lot-image, img.vehicle-image, img[alt*="vehicle"], img')
            .first()
            .attr("src") || row.find("img").first().attr("data-src");
        const itemId =
          vinText ||
          link?.split("/lot/")[1]?.split("?")[0] ||
          link?.split("/vehicle/")[1]?.split("?")[0] ||
          "";

        // Parse year/make/model from title
        const titleParts = title.split(" ");
        const year = extractYear(title);
        const make = titleParts[year ? 1 : 0] || "";
        const model =
          titleParts.slice(year ? 2 : 1, year ? 4 : 3).join(" ") || "";

        // Determine condition from text
        let condition = "clean";
        if (conditionText.toLowerCase().includes("run")) condition = "runs";
        else if (
          conditionText.toLowerCase().includes("salvage") ||
          gradeText.includes("S")
        )
          condition = "salvage";
        else if (gradeText.includes("A") || gradeText.includes("B"))
          condition = "clean";

        items.push({
          source: "adesa",
          source_deal_id: itemId,
          source_url: link ? normalizeUrl(link, ADESA_CONFIG.baseUrl) : "",
          title,
          year,
          make,
          model,
          vin: vinText,
          ask_price: price,
          mileage: extractMileage(mileageText),
          condition,
          location_city: locationText.split(",")[0]?.trim() || locationText,
          location_state: locationText.split(",")[1]?.trim() || "",
          images: imgSrc ? [imgSrc] : [],
          seller_type: "auction",
          seller: "ADESA",
          metadata: gradeText ? { grade: gradeText } : undefined,
          scraped_at: new Date().toISOString(),
        });
      });

      const hasMore = $("a.pagination-next, a.next-page").length > 0;
      return { items, hasMore };
    },
  );

  for await (const batch of gen) {
    allDeals.push(...batch);
  }

  console.log(
    `[ADESA] Found ${allDeals.length} deals (requires dealer account for live inventory)`,
  );

  if (allDeals.length > 0) {
    await upsertDeals(allDeals);
  }

  return allDeals.length;
}
