import { assertSourceAccess } from "../access-policy";
import { type ScraperConfig } from "../engine";
import { smartFetch } from "../smart-fetch";
import { enrichAndStore } from "./shared";
import { STATE_SEED_ZIPS, US_STATES } from "@/lib/geo";
import { zipToState } from "@/lib/geo/zip-state";
import { getScrapeRunScope } from "../run-scope-context";
import { getSweepPlan, type SweepPlan } from "../sweep-plan";
import { metroZipsForState } from "@/lib/geo/metro-zips";

// cars.com is a web-component SPA: the old `.vehicle-card`/`.price` selectors rotted. But every
// <fuse-card> carries a `data-vehicle-details="{JSON}"` attribute with clean structured data
// (year/make/model/trim/vin/mileage/price/bodyStyle/thumbnail). Location is NOT that search ZIP.
// It is the dealer line on the card ("City, ST") or a state/ZIP on the listing JSON. A 100mi
// search crosses state lines, so the seed state must never be written onto the row.
const LISTING_STATES = new Set<string>([...US_STATES, "DC"]);

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export function listingStateCode(value: unknown): string | undefined {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return LISTING_STATES.has(code) ? code : undefined;
}

function placeFromCard(fragment: string): { city?: string; state?: string } {
  const text = decodeEntities(fragment).replace(/<[^>]+>/g, " ");
  const re = /([A-Za-z][A-Za-z .'-]{0,40}?),\s*([A-Z]{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const state = listingStateCode(m[2]);
    const city = m[1].replace(/\s+/g, " ").trim();
    if (!state || !city || /\d/.test(city)) continue;
    return { city, state };
  }
  return {};
}

function placeFromVehicle(v: any): { city?: string; state?: string } {
  const cityRaw =
    v?.city || v?.dealerCity || v?.location?.city || v?.seller?.city;
  const city = typeof cityRaw === "string" ? cityRaw.trim() : undefined;
  const explicit = [
    v?.state,
    v?.dealerState,
    v?.locationState,
    v?.location?.state,
    v?.seller?.state,
    v?.dealer?.state,
  ];
  for (const candidate of explicit) {
    const state = listingStateCode(candidate);
    if (state) return { city, state };
  }
  const zips = [
    v?.zip,
    v?.dealerZip,
    v?.sellerZip,
    v?.postalCode,
    v?.seller?.zip,
    v?.location?.zip,
  ];
  for (const zip of zips) {
    if (!zip) continue;
    const state = listingStateCode(zipToState(String(zip)));
    if (state) return { city, state };
  }
  return { city };
}

/**
 * States Cars.com is allowed to search.
 * CARS_STATES (comma-separated) is an operator override.
 * Then one saved buyer state. Then the Docker sweep's planned states (a rotating slice).
 * Never the full US list in one run.
 */
export function resolveCarsComStates(
  env: string | undefined = process.env.CARS_STATES,
  scope = getScrapeRunScope(),
  plan: SweepPlan | undefined = getSweepPlan(),
): string[] {
  const fromEnv = String(env || "")
    .split(",")
    .map((s) => listingStateCode(s))
    .filter((s): s is string => Boolean(s));
  if (fromEnv.length) return Array.from(new Set(fromEnv));

  const saved = [scope?.state, ...(scope?.states || [])]
    .map((s) => listingStateCode(s))
    .filter((s): s is string => Boolean(s));
  const unique = Array.from(new Set(saved));
  if (unique.length) return [unique[0]];

  const planned = (plan?.states || [])
    .map((s) => listingStateCode(s))
    .filter((s): s is string => Boolean(s));
  return Array.from(new Set(planned));
}

/**
 * Search-center ZIPs for one state. The sweep plan's rotated metros when present, else the
 * first CARS_ZIPS_PER_STATE metros (default 2). Search centers only; never a row's state.
 */
export function carsComZipsForState(
  state: string,
  plan: SweepPlan | undefined = getSweepPlan(),
  perState = Math.max(1, parseInt(process.env.CARS_ZIPS_PER_STATE || "2") || 2),
): string[] {
  const code = listingStateCode(state);
  if (!code) return [];
  const planned = plan?.zipsByState?.[code];
  if (planned?.length) return planned;
  const metros = metroZipsForState(code, perState);
  if (metros.length) return metros;
  return STATE_SEED_ZIPS[code] ? [STATE_SEED_ZIPS[code]] : [];
}

/** Parse cars.com SRP HTML. Rows without a listing state are dropped. */
export function parseCarsComHtml(html: string, searchState = ""): any[] {
  // The search seed is the query center, not the car. Never copy it onto the row.
  void searchState;
  const items: any[] = [];
  const re = /<fuse-card\b([^>]*?)(?:\/>|>([\s\S]*?)<\/fuse-card>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    const details = attrs.match(/data-vehicle-details="([^"]*)"/);
    if (!details) continue;
    let v: any;
    try {
      v = JSON.parse(decodeEntities(details[1]));
    } catch {
      continue;
    }
    const price = parseInt(String(v.price || "").replace(/[^0-9]/g, ""), 10);
    const stock = String(v.stockType || "").toLowerCase();
    if (!v.vin || !price || stock === "new") continue;
    const fromVehicle = placeFromVehicle(v);
    const fromCard = placeFromCard(`${attrs} ${body}`);
    const state = fromVehicle.state || fromCard.state;
    if (!state) continue;
    const seller =
      v.seller && typeof v.seller === "object" ? v.seller.name : v.seller;
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
      location_city: fromVehicle.city || fromCard.city,
      location_state: state,
    });
  }
  return items;
}

export const CARS_COM_CONFIG: ScraperConfig = {
  name: "Cars.com",
  baseUrl: "https://www.cars.com",
  // Cloudflare-walled: static fetch + FlareSolverr both 403. Render through the (Patchright) browser
  // pool instead ? stealth Chromium passes Cloudflare headless and the SRP HTML carries the same
  // embedded listings JSON parseCarsComHtml already reads.
  renderMode: "browser",
  requestDelay: 1500,
  concurrency: 2,
  useProxies: false,
  stealth: true,
  maxPages: 10,
};

export async function scrapeCarsCom(searchTerm = "", state = "", maxPages = 5) {
  assertSourceAccess("cars_com");
  const code = listingStateCode(state);
  const zips = code ? carsComZipsForState(code) : [];
  if (!code || !zips.length) return 0;
  console.log(
    `[Cars.com] Starting scrape for ${code} around ${zips.join(", ")}...`,
  );

  // Overlapping 100mi circles return the same car twice. Store each listing once per run.
  const seen = new Set<string>();
  let saved = 0;
  for (const zip of zips) {
    for (let page = 1; page <= maxPages; page++) {
      const q = searchTerm
        ? `&searchTerm=${encodeURIComponent(searchTerm)}`
        : "";
      const url = `https://www.cars.com/shopping/results/?page=${page}${q}&stockType=used&maximum_distance=100&zip=${zip}&sort=best_match_desc`;
      const { html, blocked } = await smartFetch(url, {
        // A page can be real even when every card lacks a listing state. Do not treat that as a block.
        validate: (h) => /data-vehicle-details="/.test(h),
      });
      if (blocked) {
        console.warn(`[Cars.com] ${code} ${zip} blocked (no tier passed)`);
        break;
      }
      const items = parseCarsComHtml(html, code);
      if (!items.length) break;
      for (const v of items) {
        const key = String(v.external_id || v.vin || "");
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        await enrichAndStore(v);
        saved++;
      }
      if (items.length < 8) break;
    }
  }

  console.log(
    `[Cars.com] Stored ${saved} listings with a listing state (${code}, ${zips.length} search centers)`,
  );
  return saved;
}

// CARS_STATES, else one saved buyer state, else the sweep plan's rotating slice. Cap pages with
// CARS_MAX_PAGES. Never walks all 50 states in one run.
export async function scrapeCarsComAllStates(searchTerm = ""): Promise<number> {
  assertSourceAccess("cars_com");
  const states = resolveCarsComStates();
  if (!states.length) {
    console.warn(
      "[Cars.com] no CARS_STATES, saved buyer state, or sweep plan; not walking every state",
    );
    return 0;
  }
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
    `[Cars.com] Total: ${total} listings across ${states.length} state(s)`,
  );
  return total;
}
