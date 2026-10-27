// lib/scrapers/sources/ebay-motors.ts
// eBay Motors (category 6001) — NOT Cloudflare-walled, so it fetches directly (no FlareSolverr).
// eBay redesigned the SRP away from .s-item to .s-card / .su-card-container; we parse THAT. eBay's
// search cards are thin (title + price; VIN/mileage live on the item page) and mix in promos/parts,
// so we filter hard: a real vehicle has a 4-digit year in the title + a vehicle-range price. The
// pipeline's normalizeDeal re-derives make/model from the title and gates unknown makes.

import type { Deal } from "@/types";
import {
  disclosedPriceEvidence,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";
import { retailTitleCondition } from "./retail-evidence";
import * as cheerio from "cheerio";
import {
  paginate,
  extractPrice,
  extractMileage,
  type ScraperConfig,
} from "../engine";
import { upsertDeals } from "../pipeline";
import { sourceExecutionSignal } from "../source-execution";
import type { ScraperArgs } from "../tools/registry";
import { getScrapeRunScope } from "../run-scope-context";
import { buyerListingSearchText } from "../buyer-scope";

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

    const priceText = row.find(".s-card__price").first().text().trim();
    // A range, foreign currency or monthly amount is not one full purchase price.
    if (!/^(?:US\s*)?\$\s*\d[\d,]*(?:\.\d{2})?$/.test(priceText)) return;
    const price = extractPrice(priceText);
    if (!price || price < 1000 || price > 300000) return; // filters parts/accessories

    const link =
      row.find("a.s-card__link").attr("href") ||
      row.find('a[href*="/itm/"]').first().attr("href") ||
      "";
    let listingUrl: URL;
    try {
      listingUrl = new URL(link, "https://www.ebay.com");
      if (
        listingUrl.protocol !== "https:" ||
        !/^(?:www\.)?ebay\.com$/.test(listingUrl.hostname)
      )
        return;
    } catch {
      return;
    }
    const itemId =
      listingUrl.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)(?:\/|$)/)?.[1] || "";
    if (!itemId) return;
    listingUrl.search = "";
    listingUrl.hash = "";

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
    const statedCondition = retailTitleCondition(title);

    const text = row.text();
    const disclosed = disclosedPriceEvidence(text, price);
    const bidding = /\b\d+\s+bids?\b|\b(?:current|starting)\s+bid\b/i.test(
      text,
    );
    const buyNow = /\bbuy\s+it\s+now\b/i.test(text);
    const evidence: PriceEvidence =
      disclosed ||
      (bidding
        ? { kind: "current_bid", currentBid: price, listedAmount: price }
        : buyNow
          ? { kind: "buy_now", buyNow: price, listedAmount: price }
          : { kind: "unknown", listedAmount: price });
    items.push({
      source: "ebay_motors",
      source_deal_id: itemId,
      source_url: listingUrl.toString(),
      title,
      year,
      make,
      model,
      ask_price: ["asking", "buy_now", "unknown"].includes(evidence.kind)
        ? (evidence.askingPrice ?? evidence.buyNow ?? price)
        : 0,
      ...(evidence.buyNow ? { buy_now_price: evidence.buyNow } : {}),
      options: {
        priceEvidence: { ...evidence, checkedAt: new Date().toISOString() },
      },
      mileage: extractMileage(subtitle),
      condition: statedCondition,
      ...(statedCondition ? { title_source: "listing" as const } : {}),
      images: img ? [img] : [],
      scraped_at: new Date().toISOString(),
    });
  });

  return items;
}

export async function scrapeEbayMotors(
  maxPagesPerSearch = EBAY_MOTORS_CONFIG.maxPages,
  execution?: ScraperArgs,
) {
  console.log("[eBay Motors] Starting scrape...");
  const signal = sourceExecutionSignal(execution);
  signal?.throwIfAborted();
  const scope = getScrapeRunScope();
  // An explicit buyer search must not expand into eight unrelated popular models.
  const queries = scope ? [buyerListingSearchText(scope)] : SEARCHES;
  const seen = new Set<string>();
  let totalFound = 0;
  for (const query of queries) {
    signal?.throwIfAborted();
    const config = {
      ...EBAY_MOTORS_CONFIG,
      maxPages: maxPagesPerSearch,
      abortSignal: signal,
    };
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
    for await (const batch of gen) {
      signal?.throwIfAborted();
      const fresh = batch.filter((row) => {
        const id = row.source_deal_id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      if (!fresh.length) continue;
      // Persist each confirmed page before requesting another: a later failure keeps this receipt.
      await upsertDeals(fresh);
      totalFound += fresh.length;
    }
  }

  console.log(`[eBay Motors] Found ${totalFound} deals`);
  return totalFound;
}
