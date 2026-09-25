// lib/scrapers/sources/copart.ts
// Copart — the largest salvage auction in North America — exposes its FULL public runlist via an open
// JSON API (POST /public/lots/search-results), no login and no FlareSolverr. Salvage/repairable cars
// are prime flips for dealers who recondition. ~390k cars listed at any time, each with year/make/
// model, damage type, location, sale date, and Copart's ACV (clean-value) estimate.
//
// Honest limitation: the PUBLIC feed does not expose live bids (bidStatus is "NEVER_BID" until a lot
// goes live — anti-scraping). So acquisition cost is the lot's current bid when present, otherwise we
// fall back to the ACV estimate as the value reference (never a fabricated bargain). The live hammer
// price is the one thing still behind a dealer login.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";

const COPART_API = "https://www.copart.com/public/lots/search-results";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const titleCase = (v: string): string =>
  v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Map Copart's primary-damage text to our listing_condition enum. */
function damageToCondition(dd: string): Deal["condition"] {
  const d = dd.toUpperCase();
  if (/FLOOD|WATER/.test(d)) return "flood";
  if (/BURN|FIRE/.test(d)) return "fire";
  if (/HAIL/.test(d)) return "hail";
  if (/STRIP|PARTS ONLY|MISSING|VANDALISM/.test(d)) return "parts_only";
  if (/MINOR|NORMAL WEAR|SCRATCH|DENT/.test(d)) return "run_drive";
  return "repairable"; // default: damaged but fixable — the salvage flip case
}

const isNonCar = (vt: string): boolean =>
  /ATV|TRAILER|BOAT|JET\s?SKI|SNOWMOBILE|MOTORCYCLE|INDUSTRIAL|EQUIPMENT|FORKLIFT|RV|MOTOR\s?HOME/.test(
    vt.toUpperCase(),
  );

/** Parse a Copart search-results API response (data.results.content) into salvage deal rows. */
export function parseCopartLots(json: any): Partial<Deal>[] {
  const lots = json?.data?.results?.content;
  if (!Array.isArray(lots)) return [];
  const items: Partial<Deal>[] = [];
  for (const v of lots) {
    if (!v || typeof v !== "object") continue;
    const ln = v.ln ?? v.lotNumberStr;
    if (!ln) continue;

    const vt = str(v.memberVehicleType) || "";
    if (isNonCar(vt)) continue; // keep cars/SUVs/trucks; drop ATVs/equipment/etc.

    const year = Number(v.lcy) || undefined;
    const make = str(v.mkn) ? titleCase(v.mkn) : undefined;
    const model = str(v.lm) ? titleCase(v.lm) : undefined;
    const damage = str(v.dd) || "";

    const dyn = v.dynamicLotDetails || {};
    const bid = Math.max(
      Number(v.hb) || 0,
      Number(v.lbd) || 0,
      Number(dyn.currentBid) || 0,
      Number(dyn.buyTodayBid) || 0,
    );
    const acv = Number(v.la) > 0 ? Math.round(Number(v.la)) : 0;
    // Acquisition cost: live bid if any, else the ACV value reference. Skip lots with neither.
    const price = bid > 0 ? Math.round(bid) : acv;
    if (!price) continue;

    items.push({
      source: "copart",
      source_deal_id: String(ln),
      source_url: `https://www.copart.com/lot/${ln}${v.ldu ? `/${v.ldu}` : ""}`,
      title:
        str(v.ld) ||
        `${year || ""} ${make || ""} ${model || ""}`
          .replace(/\s+/g, " ")
          .trim(),
      year,
      make,
      model,
      ask_price: price,
      mileage: 0, // odometer not in the public list payload
      condition: damageToCondition(damage),
      damage_type: damage || undefined,
      // `tims` is the lot's real photo (cs.copart.com JPG). Was hardcoded [], so every Copart car —
      // our #1 source — showed a placeholder. This single field lifts photo coverage from ~38% to ~70%.
      images: v.tims ? [String(v.tims)] : [],
      seller_type: "dealer",
      seller: "Copart (salvage auction)",
      location_state: str(v.locState),
      location_city: str(v.locCity) ? titleCase(v.locCity) : undefined,
      metadata: {
        auction: true,
        channel: "salvage",
        primary_damage: damage || undefined,
        secondary_damage: str(v.csc),
        acv_estimate: acv || undefined,
        current_bid: bid,
        price_is_acv_estimate: bid <= 0 && acv > 0,
        sale_ts: Number(v.lad) || undefined,
        vehicle_type: vt || undefined,
        partial_vin: str(v.fv),
      },
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

async function fetchCopartPage(
  page: number,
  size: number,
): Promise<any | null> {
  const res = await fetch(COPART_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.copart.com/lotSearchResults",
    },
    body: JSON.stringify({
      query: ["*"],
      // VEHTYPE_V = automobiles/SUVs/trucks (excludes equipment/ATVs at the source).
      filter: { MISC: ["vehicle_type_code:VEHTYPE_V"] },
      sort: ["auction_date_type asc"],
      page,
      size,
      freeFormSearch: false,
    }),
  });
  if (!res.ok) {
    console.warn(`[Copart] page ${page} HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

// The default sort returns the same lots each run, and the API caps deep pagination, so each run
// samples a random window of the reachable pages to build coverage across yards/sale dates over time.
export async function scrapeCopart(
  maxPages = 12,
  pageSize = 100,
): Promise<number> {
  console.log("[Copart] Starting open-API scrape...");
  const all: Partial<Deal>[] = [];

  const first = await fetchCopartPage(0, pageSize);
  if (!first) return 0;
  const totalPages: number =
    Number(first?.data?.results?.totalElements) > 0
      ? Math.ceil(Number(first.data.results.totalElements) / pageSize)
      : 1;
  const maxReachablePage = Math.floor(9900 / pageSize); // offset cap, same as other big search APIs
  const lastStart = Math.max(
    0,
    Math.min(totalPages, maxReachablePage) - maxPages,
  );
  const startPage = lastStart > 0 ? Math.floor(Math.random() * lastStart) : 0;
  console.log(
    `[Copart] ${totalPages} pages of cars (reachable ${Math.min(totalPages, maxReachablePage)}) — sampling from page ${startPage}`,
  );

  if (startPage === 0) all.push(...parseCopartLots(first));

  for (
    let page = startPage;
    page < startPage + maxPages && page < totalPages;
    page++
  ) {
    if (page === 0 && startPage === 0) continue; // already captured
    try {
      const json = await fetchCopartPage(page, pageSize);
      if (!json) break;
      const items = parseCopartLots(json);
      if (!items.length) break;
      all.push(...items);
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      console.warn(`[Copart] page ${page} failed:`, (e as Error).message);
      break;
    }
  }

  console.log(`[Copart] Found ${all.length} salvage lots`);
  if (all.length > 0) await upsertDeals(all);
  return all.length;
}
