// lib/scrapers/sources/autotrader.ts
// AutoTrader is a Next.js SPA — the old data-cmp/CSS selectors rotted. The full inventory is in the
// __NEXT_DATA__ JSON (props.pageProps.__eggsState.inventory), keyed by listing id, with clean
// year/make/model/trim/vin/mileage/price/images. We parse THAT via FlareSolverr (renderMode static).

import type { Deal } from "@/types";
import { type ScraperConfig } from "../engine";
import { smartFetch } from "../smart-fetch";
import { upsertDeals } from "../pipeline";
import { STATE_SEED_ZIPS, US_STATES } from "@/lib/geo";
import { zipToState } from "@/lib/geo/zip-state";

const LISTING_STATES = new Set<string>([...US_STATES, "DC"]);

/** Two-letter state from the listing itself. A search ZIP is not a listing. */
export function listingStateCode(value: unknown): string | undefined {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return LISTING_STATES.has(code) ? code : undefined;
}

export const AUTOTRADER_CONFIG: ScraperConfig = {
  name: "AutoTrader",
  baseUrl: "https://www.autotrader.com",
  renderMode: "static", // direct → FlareSolverr escalation on Cloudflare block
  requestDelay: 2500,
  concurrency: 1,
  useProxies: true,
  stealth: false,
  maxPages: 10,
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

/** Parse an AutoTrader SRP into listing rows from the embedded __NEXT_DATA__ inventory. */
export function parseAutotraderNextData(
  html: string,
  seedZip = "",
): Partial<Deal>[] {
  // seedZip is the search center, not the car. A 100mi radius crosses state lines.
  void seedZip;
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
  const inv = nd?.props?.pageProps?.__eggsState?.inventory;
  if (!inv || typeof inv !== "object") return [];

  const items: Partial<Deal>[] = [];
  for (const id of Object.keys(inv)) {
    const o = inv[id] || {};
    const listingType = String(o.listingType || "").toUpperCase();
    if (listingType === "NEW") continue; // used/CPO only — resale comps
    const price = Number(
      o.pricingDetail?.displayPrice ??
        o.pricingDetail?.dealerDiscountedPrice ??
        0,
    );
    const vin = o.vin;
    if (!price || !vin) continue;

    const make = o.make?.name || o.make?.code || undefined;
    const model = o.model?.name || o.model?.code || undefined;
    const trim =
      (typeof o.atTrim === "string" && o.atTrim) ||
      (typeof o.trim === "string" && o.trim) ||
      undefined;
    const mileage =
      parseInt(String(o.mileage?.value ?? "0").replace(/[^0-9]/g, ""), 10) || 0;
    const images = Array.isArray(o.images?.sources)
      ? o.images.sources
          .map((s: any) => s?.src)
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const url = o.vdpBaseUrl
      ? o.vdpBaseUrl.startsWith("http")
        ? o.vdpBaseUrl
        : `https://www.autotrader.com${o.vdpBaseUrl}`
      : `https://www.autotrader.com/cars-for-sale/vehicle/${id}`;

    // LOCATION: only fields on this listing. The search ZIP is not the car.
    // No listing state means scrapeAutoTrader drops the row before upsert.
    const owner = o.owner || o.location || o.dealer || {};
    const rawZip =
      o.zip || owner.zip || owner.postalCode || o.postalCode || undefined;
    const locCity = o.city || owner.city || owner.cityName || undefined;
    const locState =
      listingStateCode(o.state) ||
      listingStateCode(owner.state) ||
      listingStateCode(owner.stateCode) ||
      (rawZip ? listingStateCode(zipToState(String(rawZip))) : undefined);

    // AutoTrader ships free KBB Fair Purchase Price (market value) + a price rating on every listing.
    const pd = o.pricingDetail || {};
    const kbbFpp = Number(pd.kbbFppAmount) || undefined;
    items.push({
      source: "autotrader",
      source_deal_id: vin || String(id),
      source_url: url,
      title: `${o.year || ""} ${make || ""} ${model || ""} ${trim || ""}`
        .replace(/\s+/g, " ")
        .trim(),
      year: Number(o.year) || undefined,
      make,
      model,
      trim,
      vin,
      ask_price: price,
      mileage,
      condition: listingType === "CERTIFIED" ? "certified" : "clean",
      images,
      location_city: locCity,
      location_state: locState,
      seller_type: "dealer",
      seller: o.ownerName || "AutoTrader",
      // Free KBB market value — a Manheim-MMR-equivalent benchmark we already had in hand.
      mmr_value: kbbFpp,
      options: {
        priceRating: pd.dealIndicator || undefined, // Great / Good / Fair / High
        kbbFppLow: Number(pd.kbbFppLowAmount) || undefined,
        kbbFppHigh: Number(pd.kbbFppHighAmount) || undefined,
        daysOnSite: Number(o.daysOnSite) || undefined,
        // Structured config — drivetrain/fuel are major value drivers (4WD/diesel trucks). Captured
        // here so config-aware comp matching becomes possible as this data accumulates.
        driveType: o.driveType || undefined,
        fuelType: o.fuelType || undefined,
        contact: o.phone ? { phone: String(o.phone) } : undefined,
      },
      scraped_at: new Date().toISOString(),
    } as any);
  }
  return items;
}

export async function scrapeAutoTrader(
  searchTerm = "",
  zip = "",
  maxPages = AUTOTRADER_CONFIG.maxPages,
) {
  // No zip → pick a random state seed ZIP so the rotation spreads geographic comp coverage
  // instead of re-scraping Dallas every cycle.
  if (!zip) {
    const zips = Object.values(STATE_SEED_ZIPS).filter(Boolean) as string[];
    zip = zips[Math.floor(Math.random() * zips.length)] || "75201";
  }
  console.log(`[AutoTrader] Starting scrape near ${zip}...`);
  const allDeals: Partial<Deal>[] = [];

  // Akamai-walled — smartFetch escalates to the headed real-Chrome tier (Akamai detects headless) and
  // renders the full __NEXT_DATA__ inventory. Where no display exists (bare CI) smartFetch returns
  // blocked and we degrade to 0 — AutoTempest backstops the listings until xvfb is wired.
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      zip,
      searchRadius: "100",
      ...(searchTerm && { makeCodeList: searchTerm }),
      startYear: "2010",
      numRecords: "25",
      firstRecord: String((page - 1) * 25),
    });
    const url = `https://www.autotrader.com/cars-for-sale/all-cars?${params.toString()}`;
    const { html, blocked } = await smartFetch(url, {
      validate: (h) => parseAutotraderNextData(h).length > 0,
    });
    if (blocked) {
      console.warn(`[AutoTrader] blocked near ${zip} (no tier passed)`);
      break;
    }
    const items = parseAutotraderNextData(html, zip);
    if (!items.length) break;
    // Page length still paginates. Only listing-derived states are stored.
    allDeals.push(...items.filter((d) => listingStateCode(d.location_state)));
    if (items.length < 20) break;
  }

  console.log(`[AutoTrader] Found ${allDeals.length} deals`);
  if (allDeals.length > 0) await upsertDeals(allDeals);
  return allDeals.length;
}
