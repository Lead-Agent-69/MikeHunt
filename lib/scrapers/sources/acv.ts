// lib/scrapers/sources/acv.ts
// ─── ACV Auctions wholesale scraper (requires dealer account) ─────────────────

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

export const ACV_CONFIG: ScraperConfig = {
  name: "ACV Auctions",
  baseUrl: "https://www.acvauctions.com",
  renderMode: "browser", // ACV is a React SPA, requires JS
  requestDelay: 3500, // Digital platform, slower to avoid rate limits
  concurrency: 1, // Conservative for API-driven site
  useProxies: true,
  stealth: true,
  maxPages: 15, // Digital auctions have more inventory
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
};

export async function scrapeAcv(maxPages = ACV_CONFIG.maxPages) {
  console.log("[ACV Auctions] Starting scrape...");
  const allDeals: Partial<Deal>[] = [];

  const config = { ...ACV_CONFIG, maxPages };
  const gen = paginate<Partial<Deal>>(
    config,
    (page) => `https://www.acvauctions.com/marketplace?page=${page}`,
    async (input) => {
      const $ = typeof input === "string" ? cheerio.load(input) : input;
      const items: Partial<Deal>[] = [];

      // ACV uses React components with data attributes
      $(
        'div.deal-item, div[data-testid="vehicle-card"], .vehicle-deal, [data-testid="listing-card"], .listing-item, .auction-card',
      ).each((_: number, el: any) => {
        const row = $(el);

        // Try multiple title selectors for React components
        const title = row
          .find(
            'h2.vehicle-title, .vehicle-title, [data-testid="vehicle-title"], .ymm-text, h3',
          )
          .text()
          .trim();
        if (!title) return;

        // ACV shows current bid or buy-now price
        const priceText = row
          .find(
            'span.current-price, .current-price, [data-testid="price"], .bid-amount, .buy-now-price, .current-bid',
          )
          .text()
          .trim();
        const price = extractPrice(priceText);
        if (!price) return;

        // Extract additional fields
        const mileageText = row
          .find(
            'span.vehicle-mileage, .vehicle-mileage, [data-testid="mileage"], .odometer-value',
          )
          .text()
          .trim();
        const vinText = row
          .find(
            'span.vehicle-vin, .vehicle-vin, [data-testid="vin"], .vin-display',
          )
          .text()
          .trim();
        const locationText = row
          .find(
            'span.vehicle-location, .vehicle-location, [data-testid="location"], .seller-location',
          )
          .text()
          .trim();
        const conditionText = row
          .find(
            '.condition-report, [data-testid="condition"], .cr-grade, .grade',
          )
          .text()
          .trim();
        const timeLeftText = row
          .find('.time-remaining, [data-testid="time-left"], .auction-timer')
          .text()
          .trim();
        const link =
          row.find('a[href*="/vehicle/"], a[href*="/listing/"]').attr("href") ||
          row.find("a").first().attr("href");
        const imgSrc =
          row
            .find('img.vehicle-image, img[alt*="vehicle"], img')
            .first()
            .attr("src") || row.find("img").first().attr("data-src");
        const itemId =
          vinText ||
          link?.split("/vehicle/")[1]?.split("?")[0] ||
          link?.split("/listing/")[1]?.split("?")[0] ||
          "";

        // Parse year/make/model from title
        const titleParts = title.split(" ");
        const year = extractYear(title);
        const make = titleParts[year ? 1 : 0] || "";
        const model =
          titleParts.slice(year ? 2 : 1, year ? 4 : 3).join(" ") || "";

        // Determine condition from grade
        let condition = "clean";
        if (conditionText.toLowerCase().includes("run")) condition = "runs";
        else if (
          conditionText.toLowerCase().includes("salvage") ||
          conditionText.includes("2.") ||
          conditionText.includes("1.")
        )
          condition = "salvage";
        else if (conditionText.includes("4.") || conditionText.includes("5."))
          condition = "clean";

        items.push({
          source: "acv",
          source_deal_id: itemId,
          source_url: link ? normalizeUrl(link, ACV_CONFIG.baseUrl) : "",
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
          seller: "ACV Auctions",
          metadata: {
            condition_report: conditionText || undefined,
            time_left: timeLeftText || undefined,
          },
          scraped_at: new Date().toISOString(),
        });
      });

      const hasMore =
        $("button.load-more, a.next-page, a.pagination-next").length > 0;
      return { items, hasMore };
    },
  );

  for await (const batch of gen) {
    allDeals.push(...batch);
  }

  console.log(
    `[ACV Auctions] Found ${allDeals.length} deals (requires dealer account for live data)`,
  );

  if (allDeals.length > 0) {
    await upsertDeals(allDeals);
  }

  return allDeals.length;
}
