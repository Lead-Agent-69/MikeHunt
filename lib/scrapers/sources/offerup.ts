// lib/scrapers/sources/offerup.ts
// OfferUp — local private-party marketplace. Not dead: the SPA renders 50 listings/page and embeds them
// in __NEXT_DATA__ (props.pageProps.searchFeedResponse.looseTiles). The old CSS-selector scraper rotted;
// we now read the structured JSON through smartFetch (static→headed as needed). Great flip inventory —
// motivated private sellers, room to offer.

import type { Deal } from "@/types";
import { extractYear, type ScraperConfig } from "../engine";
import { smartFetch } from "../smart-fetch";
import { upsertDeals } from "../pipeline";

export const OFFERUP_CONFIG: ScraperConfig = {
  name: "OfferUp",
  baseUrl: "https://offerup.com",
  renderMode: "browser",
  requestDelay: 3000,
  concurrency: 1,
  useProxies: false,
  stealth: true,
  maxPages: 1,
};

/** Parse an OfferUp search page into listing rows from the embedded __NEXT_DATA__ feed. */
export function parseOfferUpHtml(html: string): Partial<Deal>[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let nd: any;
  try {
    nd = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const tiles = nd?.props?.pageProps?.searchFeedResponse?.looseTiles;
  if (!Array.isArray(tiles)) return [];

  const items: Partial<Deal>[] = [];
  for (const t of tiles) {
    if (t?.tileType !== "LISTING" || !t.listing) continue; // skip ad tiles
    const L = t.listing;
    const price = Number(L.price);
    const title: string = L.title || "";
    const year = extractYear(title);
    // Vehicles only: a real year + a sane price (filters parts/junk).
    if (!year || !price || price < 500) continue;

    const parts = title.split(/\s+/);
    const yearIdx = parts.findIndex((p: string) => p === String(year));
    const loc = String(L.locationName || "").split(",");
    items.push({
      source: "offerup",
      source_deal_id: String(L.listingId),
      source_url: `https://offerup.com/item/detail/${L.listingId}`,
      title,
      year,
      make: parts[yearIdx + 1] || "",
      model: parts.slice(yearIdx + 2, yearIdx + 4).join(" ") || "",
      ask_price: price,
      mileage: Number(L.vehicleMiles) || 0,
      condition: /salvage|rebuilt|parts only|not running/i.test(title)
        ? "salvage"
        : "clean",
      location_city: loc[0]?.trim() || "",
      location_state: loc[1]?.trim() || "",
      images: L.image?.url ? [String(L.image.url)] : [],
      seller_type: "private",
      seller: "OfferUp",
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

export async function scrapeOfferUp(searchTerm = "") {
  console.log("[OfferUp] Starting scrape...");
  // OfferUp is local (IP-geolocated). A handful of vehicle queries maxes the 50/page yield per term;
  // the Docker fleet's different IPs naturally spread regional coverage.
  const queries = searchTerm
    ? [searchTerm]
    : ["truck", "car", "suv", "sedan", "van"];
  const allDeals: Partial<Deal>[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    const url = `https://offerup.com/search/?q=${encodeURIComponent(q)}`;
    const { html, blocked } = await smartFetch(url, {
      validate: (h) => parseOfferUpHtml(h).length > 0,
    });
    if (blocked) {
      console.warn(`[OfferUp] blocked for "${q}" (no tier passed)`);
      continue;
    }
    for (const item of parseOfferUpHtml(html)) {
      const id = item.source_deal_id!;
      if (seen.has(id)) continue;
      seen.add(id);
      allDeals.push(item);
    }
  }

  console.log(`[OfferUp] Found ${allDeals.length} deals`);
  if (allDeals.length > 0) await upsertDeals(allDeals);
  return allDeals.length;
}
