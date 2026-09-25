import { type ScraperConfig } from "../engine";
import { smartFetch } from "../smart-fetch";
import { enrichAndStore } from "./shared";
import { STATE_SEED_ZIPS, US_STATES } from "@/lib/geo";

// cars.com is a web-component SPA: the old `.vehicle-card`/`.price` selectors rotted. But every
// <fuse-card> carries a `data-vehicle-details="{…JSON…}"` attribute with clean structured data
// (year/make/model/trim/vin/mileage/price/bodyStyle/thumbnail). We read THAT — robust to CSS churn.
const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Parse cars.com SRP HTML into listing rows from the embedded data-vehicle-details JSON. */
export function parseCarsComHtml(html: string, state = ""): any[] {
  const items: any[] = [];
  const re = /data-vehicle-details="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let v: any;
    try {
      v = JSON.parse(decodeEntities(m[1]));
    } catch {
      continue;
    }
    const price = parseInt(String(v.price || "").replace(/[^0-9]/g, ""), 10);
    const stock = String(v.stockType || "").toLowerCase();
    if (!v.vin || !price || stock === "new") continue; // used/CPO only for resale comps
    const seller =
      v.seller && typeof v.seller === "object" ? v.seller.name : v.seller;
    // listing_condition is an enum — map cars.com stock type to a valid value (no "used").
    const condition =
      stock === "certified" || v.cpoIndicator ? "certified" : "clean";
    items.push({
      source: "cars_com",
      source_category: "retail",
      external_id: v.listingId || v.vin,
      listing_url: v.listingId
        ? `https://www.cars.com/vehicledetail/${v.listingId}/`
        : `https://www.cars.com/`,
      title: `${v.year || ""} ${v.make || ""} ${v.model || ""} ${v.trim || ""}`
        .replace(/\s+/g, " ")
        .trim(),
      year: parseInt(String(v.year || ""), 10) || undefined,
      make: v.make || undefined,
      model: v.model || undefined,
      trim: v.trim || undefined,
      vin: v.vin || undefined,
      asking_price: price,
      odometer:
        parseInt(String(v.mileage || "0").replace(/[^0-9]/g, ""), 10) || 0,
      condition,
      body_class: v.bodyStyle || undefined,
      images: v.primaryThumbnail ? [v.primaryThumbnail] : [],
      seller: seller || undefined,
      seller_type: "dealer",
      location_state: state ? state.toUpperCase() : undefined,
    });
  }
  return items;
}

export const CARS_COM_CONFIG: ScraperConfig = {
  name: "Cars.com",
  baseUrl: "https://www.cars.com",
  // Cloudflare-walled: static fetch + FlareSolverr both 403. Render through the (Patchright) browser
  // pool instead — stealth Chromium passes Cloudflare headless and the SRP HTML carries the same
  // embedded listings JSON parseCarsComHtml already reads. See open-api-source-unlocks memory.
  renderMode: "browser",
  requestDelay: 1500,
  concurrency: 2,
  useProxies: false,
  stealth: true,
  maxPages: 10,
};

export async function scrapeCarsCom(
  searchTerm = "",
  state = "tx",
  maxPages = 5,
) {
  console.log("[Cars.com] Starting scrape...");
  const zip = STATE_SEED_ZIPS[state?.toUpperCase()] || "";
  if (!zip) return 0;

  // Cloudflare-walled — smartFetch escalates past it (stealth headless tier) and reuses the warm
  // browser across pages. The SRP HTML carries the embedded listings JSON parseCarsComHtml reads.
  let saved = 0;
  for (let page = 1; page <= maxPages; page++) {
    const q = searchTerm ? `&searchTerm=${encodeURIComponent(searchTerm)}` : "";
    const url = `https://www.cars.com/shopping/results/?page=${page}${q}&stockType=used&maximum_distance=100&zip=${zip}&sort=best_match_desc`;
    const { html, blocked } = await smartFetch(url, {
      validate: (h) => parseCarsComHtml(h).length > 0,
    });
    if (blocked) {
      console.warn(`[Cars.com] ${state} blocked (no tier passed)`);
      break;
    }
    const items = parseCarsComHtml(html, state);
    if (!items.length) break; // no more results
    for (const v of items) {
      await enrichAndStore(v);
      saved++;
    }
    if (items.length < 8) break; // partial grid → last page
  }

  console.log(`[Cars.com] Found ${saved} listings (${state})`);
  return saved;
}

// Nationwide Cars.com: iterate one seed ZIP per state (radius 100mi). Override the state set
// with CARS_STATES env (comma-separated); cap pages/state with CARS_MAX_PAGES.
export async function scrapeCarsComAllStates(searchTerm = ""): Promise<number> {
  const fromEnv = process.env.CARS_STATES?.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  // Shuffle so the per-source timeout doesn't always burn on the same first states — over many
  // cycles this spreads cars.com coverage across all of them.
  const states = fromEnv?.length
    ? fromEnv
    : [...US_STATES].sort(() => Math.random() - 0.5);
  const maxPages = parseInt(process.env.CARS_MAX_PAGES || "3");
  let total = 0;
  for (const state of states) {
    try {
      total += await scrapeCarsCom(searchTerm, state, maxPages);
    } catch (e) {
      console.error(`[Cars.com] ${state} failed:`, (e as Error).message);
    }
  }
  console.log(
    `[Cars.com] Nationwide total: ${total} listings across ${states.length} states`,
  );
  return total;
}
