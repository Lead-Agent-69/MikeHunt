// lib/scrapers/sources/cargurus.ts
// CarGurus is a React SPA whose CSS selectors rot. Its inventory AJAX endpoint
// (ajaxFetchSubsetInventoryListing.action) returns a clean JSON `listings` array — we read THAT via
// FlareSolverr (renderMode static). Field names are handled defensively (CarGurus varies them), so
// the parser survives minor shape changes. Best-effort until verified against a live fetch, but it
// fails safe (returns [] if the shape doesn't match — never crashes the run).

import type { Deal } from "@/types";
import { paginate, type ScraperConfig } from "../engine";
import { upsertDeals } from "../pipeline";
import { STATE_SEED_ZIPS, US_STATES } from "@/lib/geo";
import { getScrapeRunScope } from "../run-scope-context";
import { buyerListingSearchText } from "../buyer-scope";
import { buyerSearchCenters } from "../search-centers";
import { getSweepPlan, sweepPlanZips, type SweepPlan } from "../sweep-plan";

const LISTING_STATES = new Set<string>([...US_STATES, "DC"]);

export const CARGURUS_CONFIG: ScraperConfig = {
  name: "CarGurus",
  baseUrl: "https://www.cargurus.com",
  renderMode: "static", // direct → FlareSolverr escalation on Cloudflare block
  requestDelay: 2500,
  concurrency: 1,
  useProxies: true,
  stealth: false,
  maxPages: 10,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

const num = (v: unknown): number =>
  Number(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Parse a CarGurus inventory response (JSON from the AJAX endpoint, or embedded JSON in HTML). */
export function parseCargurusListings(raw: string): Partial<Deal>[] {
  let listings: any[] = [];
  try {
    const j = JSON.parse(raw);
    listings = Array.isArray(j)
      ? j
      : j.listings || j.results || j.tilesData || j.inventory || [];
  } catch {
    // Fall back to pulling a "listings":[ … ] array out of embedded HTML JSON.
    const m = raw.match(/"listings"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (m) {
      try {
        listings = JSON.parse(m[1]);
      } catch {
        listings = [];
      }
    }
  }

  const items: Partial<Deal>[] = [];
  for (const l of Array.isArray(listings) ? listings : []) {
    if (!l || typeof l !== "object") continue;
    const price = num(
      l.price ?? l.expectedPrice ?? l.priceNumber ?? l.listPrice,
    );
    const vin = str(l.vin) || str(l.vinNumber);
    const id = String(l.id ?? l.listingId ?? vin ?? "");
    if (!price || !id) continue;

    const make = str(l.makeName) || str(l.make);
    const model = str(l.modelName) || str(l.model);
    const trim = str(l.trimName) || str(l.trim);
    const year = num(l.carYear ?? l.year);
    const mileage = num(l.mileage ?? l.localizedExposedMileage ?? l.odometer);
    const images = Array.isArray(l.originalPhotoUrls)
      ? l.originalPhotoUrls.filter(Boolean).slice(0, 8)
      : str(l.originalPictureUrl)
        ? [l.originalPictureUrl]
        : [];
    const rating = String(l.dealRating || l.priceRating || "").toLowerCase();
    const reportedState =
      str(l.sellerState) || str(l.state) || str(l.location?.state);
    const state = reportedState?.toUpperCase();

    items.push({
      source: "cargurus",
      source_deal_id: id,
      source_url: `https://www.cargurus.com/Cars/link/${id}`,
      title:
        str(l.listingTitle) ||
        `${year || ""} ${make || ""} ${model || ""} ${trim || ""}`
          .replace(/\s+/g, " ")
          .trim(),
      year: year || undefined,
      make,
      model,
      trim,
      vin,
      ask_price: price,
      mileage,
      condition: "clean",
      title_source: "source_default",
      location_city: str(l.sellerCity) || str(l.city) || str(l.location?.city),
      location_state: state && LISTING_STATES.has(state) ? state : undefined,
      images,
      seller_type: "dealer",
      seller: str(l.sellerName) || "CarGurus",
      metadata: { deal_rating: rating || undefined },
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

export function cargurusSearchZips(
  zip = "",
  scope = getScrapeRunScope(),
  plan: SweepPlan | undefined = getSweepPlan(),
  random = Math.random,
): string[] {
  if (scope?.state || scope?.states?.length) return buyerSearchCenters(scope);
  if (zip) return [zip];
  const planned = sweepPlanZips(plan);
  if (planned.length) return planned;
  const zips = Object.values(STATE_SEED_ZIPS).filter(Boolean) as string[];
  return [zips[Math.floor(random() * zips.length)] || "75201"];
}

export async function scrapeCarGurus(
  searchTerm = "",
  zip = "",
  maxPages = CARGURUS_CONFIG.maxPages,
) {
  const centers = cargurusSearchZips(zip);
  const query = buyerListingSearchText(getScrapeRunScope(), searchTerm);
  const pagesPerCenter = centers.length > 1 ? Math.min(maxPages, 3) : maxPages;
  console.log(`[CarGurus] Starting scrape near ${centers.join(", ")}...`);
  const seen = new Set<string>();
  let total = 0;

  for (const center of centers) {
    const allDeals: Partial<Deal>[] = [];
    const config = { ...CARGURUS_CONFIG, maxPages: pagesPerCenter };
    const gen = paginate<Partial<Deal>>(
      config,
      (page) => {
        const params = new URLSearchParams({
          zip: center,
          distance: "100",
          ...(query && { searchTerm: query }),
          startYear: "2010",
          maxResults: "25",
          offset: String((page - 1) * 25),
          inventorySearchWidgetType: "AUTO",
          sortType: "DEAL_SCORE",
        });
        return `https://www.cargurus.com/Cars/inventorylisting/ajaxFetchSubsetInventoryListing.action?${params.toString()}`;
      },
      async (input) => {
        const raw =
          typeof input === "string"
            ? input
            : ((input as any)?.html?.() ?? String(input));
        const items = parseCargurusListings(raw);
        return { items, hasMore: items.length >= 20 };
      },
    );

    for await (const batch of gen) {
      for (const deal of batch) {
        const id = String(deal.source_deal_id || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        allDeals.push(deal);
      }
    }
    if (allDeals.length > 0) await upsertDeals(allDeals);
    total += allDeals.length;
  }
  console.log(`[CarGurus] Found ${total} source listings`);
  return total;
}
