// lib/scrapers/sources/truecar.ts
// ─── TrueCar scraper - Certified pre-owned with market value data ─────────────

import type { Deal } from "@/types";
import { type ScraperConfig } from "../engine";
import { smartFetch } from "../smart-fetch";
import { upsertDeals } from "../pipeline";
import { getScrapeRunScope } from "../run-scope-context";
import { buyerListingSearchText } from "../buyer-scope";
import { buyerSearchCenters } from "../search-centers";

// TrueCar is a Next.js + Apollo SPA — the DOM selectors rot, but every listing sits in the
// __NEXT_DATA__ Apollo cache as a `ConsumerSummaryListing:` entry with normalized refs to the vehicle,
// pricing, and dealership. We parse THAT (resolving refs), which is stable across UI churn.
export function parseTrueCarHtml(html: string): Partial<Deal>[] {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) return [];
  let nd: any;
  try {
    nd = JSON.parse(m[1]);
  } catch {
    return [];
  }

  // The Apollo map's path varies between renders — find the object that holds the listing entries.
  let apollo: any = null;
  (function walk(o: any) {
    if (!o || typeof o !== "object" || apollo) return;
    for (const k of Object.keys(o)) {
      if (k.startsWith("ConsumerSummaryListing:")) {
        apollo = o;
        return;
      }
      walk(o[k]);
    }
  })(nd);
  if (!apollo) return [];

  const deref = (r: any) => (r && r.__ref ? apollo[r.__ref] : r);
  const nameOf = (v: any) =>
    typeof v === "string" ? v : deref(v)?.name || v?.name || "";

  const items: Partial<Deal>[] = [];
  for (const key of Object.keys(apollo)) {
    if (!key.startsWith("ConsumerSummaryListing:")) continue;
    const L = apollo[key];
    const veh = deref(L.vehicle);
    const pr = deref(L.pricing);
    if (!veh?.vin || !pr?.listPrice) continue;
    const dl = deref(L.dealership);
    const loc = deref(dl?.location) || {};
    const imgKey = Object.keys(L).find((k) => k.startsWith("galleryImages"));
    const images = imgKey
      ? (L[imgKey]?.edges || [])
          .map((e: any) => deref(e?.node)?.url)
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const make = nameOf(veh.make);
    const model = nameOf(veh.model);
    // TrueCar's price rating (its "deal indicator") lives as marketAnalysis.priceQuality — a label, not a
    // dollar value (captured in docs/findings/value-schemas.md). Normalize its scale to AutoTrader's
    // vocabulary so options.priceRating means the same thing across sources for the UI + Deal IQ.
    const ma = deref(L.marketAnalysis) || deref(pr?.marketAnalysis) || {};
    const rawQuality = String(
      ma.priceQuality || pr?.priceQuality || "",
    ).toUpperCase();
    const priceRating =
      (
        {
          EXCELLENT: "Great",
          GREAT: "Great",
          GOOD: "Good",
          FAIR: "Fair",
          HIGH: "High",
          OVERPRICED: "High",
        } as Record<string, string>
      )[rawQuality] || undefined;
    items.push({
      source: "truecar",
      source_deal_id: veh.vin,
      source_url: `https://www.truecar.com/used-cars-for-sale/listing/${veh.vin}/`,
      title: `${veh.year || ""} ${make} ${model}`.replace(/\s+/g, " ").trim(),
      year: Number(veh.year) || undefined,
      make,
      model,
      vin: veh.vin,
      ask_price: Number(pr.listPrice),
      mileage: Number(veh.mileage) || 0,
      // Non-CPO "clean" is the marketplace default, not a stated title; CPO is not a title at all.
      condition: veh.certifiedPreOwned ? "certified" : "clean",
      ...(veh.certifiedPreOwned
        ? {}
        : { title_source: "source_default" as const }),
      location_city: loc.city || "",
      location_state: loc.state || loc.stateCode || loc.stateAbbreviation || "",
      images,
      seller_type: "dealer",
      seller: dl?.name || "TrueCar",
      options: priceRating ? { priceRating } : undefined,
      scraped_at: new Date().toISOString(),
    } as any);
  }
  return items;
}

export const TRUECAR_CONFIG: ScraperConfig = {
  name: "TrueCar",
  baseUrl: "https://www.truecar.com",
  renderMode: "browser", // API-driven React app
  requestDelay: 3500,
  concurrency: 1,
  useProxies: true,
  stealth: true,
  maxPages: 12,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

export async function scrapeTrueCar(
  searchTerm = "",
  zip = "75201",
  maxPages = TRUECAR_CONFIG.maxPages,
) {
  const scope = getScrapeRunScope();
  const query = buyerListingSearchText(scope, searchTerm);
  const centers =
    scope?.state || scope?.states?.length ? buyerSearchCenters(scope) : [zip];
  console.log(
    `[TrueCar] Starting scrape for "${query}" near ${centers.join(", ")}...`,
  );
  const allDeals = new Map<string, Partial<Deal>>();
  const pagesPerCenter = centers.length > 1 ? Math.min(maxPages, 3) : maxPages;

  // PerimeterX-walled — smartFetch escalates to the headed real-Chrome tier (detects headless).
  for (const center of centers) {
    for (let page = 1; page <= pagesPerCenter; page++) {
      const params = new URLSearchParams({
        zip: center,
        searchRadius: "500",
        ...(query && { searchText: query }),
        page: String(page),
      });
      const url = `https://www.truecar.com/used-cars-for-sale/listings?${params.toString()}`;
      const { html, blocked } = await smartFetch(url, {
        validate: (h) => parseTrueCarHtml(h).length > 0,
      });
      if (blocked) {
        console.warn(`[TrueCar] blocked near ${center} (no tier passed)`);
        break;
      }
      const items = parseTrueCarHtml(html);
      if (!items.length) break;
      for (const item of items) {
        if (item.source_deal_id) allDeals.set(item.source_deal_id, item);
      }
      if (items.length < 10) break;
    }
  }

  console.log(`[TrueCar] Found ${allDeals.size} deals`);
  return allDeals.size ? await upsertDeals(Array.from(allDeals.values())) : 0;
}
