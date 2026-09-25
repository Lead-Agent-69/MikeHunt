// lib/scrapers/sources/bring-a-trailer.ts
// ─── Bring a Trailer scraper - Enthusiast auctions for classic/collectible ────

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

export const BAT_CONFIG: ScraperConfig = {
  name: "Bring a Trailer",
  baseUrl: "https://bringatrailer.com",
  renderMode: "static", // Mostly static HTML
  requestDelay: 4000, // Respectful delay
  concurrency: 1,
  useProxies: false, // Respectful scraping
  stealth: true,
  maxPages: 8,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

export async function scrapeBringATrailer(
  searchTerm = "",
  maxPages = BAT_CONFIG.maxPages,
) {
  console.log(`[Bring a Trailer] Starting scrape for "${searchTerm}"...`);
  const allDeals: Partial<Deal>[] = [];

  const config = { ...BAT_CONFIG, maxPages };
  const gen = paginate<Partial<Deal>>(
    config,
    (page) => {
      const baseUrl = "https://bringatrailer.com/auctions";
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        page: String(page),
      });
      return `${baseUrl}?${params.toString()}`;
    },
    async (input) => {
      const $ = typeof input === "string" ? cheerio.load(input) : input;
      const items: Partial<Deal>[] = [];

      // BAT uses specific class structure
      $(".auction-item, .listing-item, article.auction").each(
        (_: number, el: any) => {
          const row = $(el);

          // Extract title
          const title = row
            .find(".auction-title, h2 a, .listing-title")
            .text()
            .trim();
          if (!title) return;

          // Extract current bid
          const bidText = row
            .find(".auction-current-bid, .current-bid, .bid-amount")
            .text()
            .trim();
          const currentBid = extractPrice(bidText);

          // Extract reserve status
          const reserveMet =
            row.find(".reserve-met, .no-reserve").length > 0 ||
            bidText.toLowerCase().includes("reserve met") ||
            bidText.toLowerCase().includes("no reserve");

          // Extract time left
          const timeLeftText = row
            .find(".auction-time-left, .time-remaining, .ends-in")
            .text()
            .trim();

          // Extract mileage
          const mileageText = row
            .find(".auction-mileage, .mileage, .odometer")
            .text()
            .trim();

          // Extract location
          const locationText = row
            .find(".auction-location, .location")
            .text()
            .trim();

          // Extract link
          const link =
            row.find('a[href*="/auctions/"]').attr("href") ||
            row.find("a").first().attr("href");

          // Extract image
          const imgSrc =
            row.find("img.auction-image, img").first().attr("src") ||
            row.find("img").first().attr("data-src");

          // Extract auction ID
          const auctionId = link?.match(/\/auctions\/([^\/]+)/)?.[1] || "";

          // Parse year/make/model
          const titleParts = title.split(" ");
          const year = extractYear(title);
          const make = titleParts[year ? 1 : 0] || "";
          const model = titleParts.slice(year ? 2 : 1).join(" ") || "";

          // Determine if auction is active
          const isActive =
            !timeLeftText.toLowerCase().includes("ended") &&
            !timeLeftText.toLowerCase().includes("sold");

          // Only include active auctions or recently ended
          if (!isActive && !timeLeftText.toLowerCase().includes("hour")) {
            return; // Skip old auctions
          }

          items.push({
            source: "bring-a-trailer",
            source_deal_id: auctionId,
            source_url: link ? normalizeUrl(link, BAT_CONFIG.baseUrl) : "",
            title,
            year,
            make,
            model,
            ask_price: currentBid || 0, // Current bid as price
            mileage: extractMileage(mileageText),
            condition: "clean", // BAT mostly clean title classics
            location_city: locationText.split(",")[0]?.trim() || locationText,
            location_state: locationText.split(",")[1]?.trim() || "",
            images: imgSrc ? [imgSrc] : [],
            seller_type: "auction",
            seller: "Bring a Trailer",
            metadata: {
              auction_type: "enthusiast",
              reserve_met: reserveMet,
              time_left: timeLeftText,
              is_active: isActive,
              collectible: true,
            },
            scraped_at: new Date().toISOString(),
          });
        },
      );

      const hasMore = $('a.next, .pagination-next, a[rel="next"]').length > 0;
      return { items, hasMore };
    },
  );

  for await (const batch of gen) {
    allDeals.push(...batch);
  }

  console.log(`[Bring a Trailer] Found ${allDeals.length} deals`);

  if (allDeals.length > 0) {
    await upsertDeals(allDeals);
  }

  return allDeals.length;
}
