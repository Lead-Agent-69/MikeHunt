// lib/scrapers/sources/copart.ts
// Copart search responses may omit prices and condition details. Preserve reported bids,
// buy-now amounts and pre-loss reference values separately; none establish final purchase cost.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";
import {
  positivePrice,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";

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
  if (/PARTS ONLY|NON.?REPAIRABLE/.test(d)) return "parts_only";
  // Damage text alone proves neither operability, title brand nor repairability.
  return undefined;
}

const isNonCar = (vt: string): boolean =>
  /ATV|TRAILER|BOAT|JET\s?SKI|SNOWMOBILE|MOTORCYCLE|INDUSTRIAL|EQUIPMENT|FORKLIFT|RV|MOTOR\s?HOME/.test(
    vt.toUpperCase(),
  );

/** Odometer from the public lots JSON (`orr`), unless Copart marks it not actual / exempt. */
export function copartOdometer(v: any): number | undefined {
  const miles = Math.round(Number(v?.orr));
  if (!Number.isFinite(miles) || miles < 1 || miles > 999_999) return undefined;
  if (
    /not actual|exempt|exceeds|tmu|broken|unknown/i.test(String(v?.ord ?? ""))
  )
    return undefined;
  return miles;
}

/** "33578 7610" -> "33578". */
export function copartZip(raw: unknown): string | undefined {
  return String(raw ?? "").match(/^\s*(\d{5})/)?.[1];
}

/**
 * Copart's `lad` is the sale-day timestamp, while `at` is a yard-local time
 * without a reliable UTC offset. Keep the lot visible through that UTC day,
 * then let the shared auction window retire it instead of leaving it active
 * forever. This is deliberately day precision, not an invented exact time.
 */
export function copartAuctionEnd(v: any): string | undefined {
  const timestamp = Number(v?.lad);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return undefined;
  date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}

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
    const bid = positivePrice(dyn.currentBid) || positivePrice(v.hb) || 0;
    const buyNow = positivePrice(dyn.buyTodayBid);
    const acv = positivePrice(v.la) || positivePrice(v.lotPlugAcv);
    const price = bid || buyNow || 0;
    const priceEvidence: PriceEvidence = {
      kind: bid
        ? "current_bid"
        : buyNow
          ? "buy_now"
          : acv
            ? "reference"
            : "unknown",
      currentBid: bid || undefined,
      buyNow,
      referenceValue: acv,
    };

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
      buy_now_price: buyNow,
      options: { priceEvidence },
      auction_end: copartAuctionEnd(v),
      // `orr` is the odometer reading in the public lots JSON (checked 2026-10-10: 74308 on a 2017
      // Sentra). Not-actual / exempt readings ("ord") are dropped, never guessed.
      mileage: copartOdometer(v),
      trim: str(v.ltd),
      location_zip: copartZip(v.zip),
      condition: damageToCondition(damage),
      damage_type: damage || undefined,
      // `tims` is the lot's real photo (cs.copart.com JPG). Was hardcoded [], so every Copart car —
      // our #1 source — showed a placeholder. This single field lifts photo coverage from ~38% to ~70%.
      images: v.tims ? [String(v.tims)] : [],
      seller_type: "auction",
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
        price_is_acv_estimate: !price && !!acv,
        sale_ts: Number(v.lad) || undefined,
        sale_time_local: str(v.at),
        sale_timezone: str(v.tz),
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
    throw new Error(
      `Copart inventory request unavailable (HTTP ${res.status}).`,
    );
  }
  return res.json();
}

export async function previewCopartLots(
  pageSize = 24,
): Promise<Partial<Deal>[]> {
  const json = await fetchCopartPage(0, pageSize);
  return json ? parseCopartLots(json).slice(0, pageSize) : [];
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
  return all.length > 0 ? await upsertDeals(all) : 0;
}
