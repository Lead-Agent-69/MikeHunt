// lib/scrapers/sources/lqdt-maestro.ts
//
// Shared core for Liquidity-Services auction marketplaces, which all run on ONE backend:
// `maestro.lqdt1.com/search/list`. GovDeals (businessId "GD") and AllSurplus (businessId "AD") are the
// same API with a different businessId + category set — so we implement the fetch + map ONCE here and
// let each source be a thin config wrapper (govdeals.ts, allsurplus.ts). Captured by Antigravity
// (clean-IP browser) in docs/findings/{govdeals-api,allsurplus-api,govdeals-images}.md, verified
// reachable from our IP too (the JSON API isn't IP-walled like the SPA/image host). No login, no proxy.
//
// Auth = the site's own PUBLIC anonymous keys (shipped to every browser); x-user-id:-1 = anonymous;
// x-api-correlation-id is just a required request-trace UUID (any value).

import type { Deal } from "@/types";
import { isCarOrTruck } from "../vehicle-class";
import { upsertDeals } from "../pipeline";
import { getLocalWriteContext } from "../local-write-context";
import { createServerComponentClient } from "@/lib/supabase";
import {
  isLightVehicleComp,
  writeSoldListings,
  type SoldListingInsert,
  readTextCapped,
} from "@/lib/sources/open-gov/sold-comps";

const API = "https://maestro.lqdt1.com/search/list";

// Image CDN base (A7 capture): the search API returns only a photo FILENAME like
// `{accountId}_{assetId}_{uuid}.jpg`; the full URL is this base + `{accountId}/` + filename.
const IMAGE_BASE = "https://webassets.lqdt1.com/assets/photos";

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "Ocp-Apim-Subscription-Key": "cf620d1d8f904b5797507dc5fd1fdb80",
  "x-api-key": "af93060f-337e-428c-87b8-c74b5837d6cd",
  "x-user-id": "-1",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export interface MaestroAsset {
  assetId?: number;
  accountId?: number;
  auctionId?: number;
  assetShortDescription?: string;
  assetLongDescription?: string | null;
  makebrand?: string;
  model?: string;
  modelYear?: string;
  vinserial?: string;
  meter?: string;
  meterCount?: number;
  meterAccurate?: string;
  currentBid?: number;
  assetBidPrice?: number;
  bidCount?: number;
  locationAddress1?: string;
  locationAddress2?: string;
  locationCity?: string;
  locationState?: string;
  locationZip?: string;
  latitude?: number | null;
  longitude?: number | null;
  country?: string;
  countryDescription?: string;
  companyName?: string;
  displaySellerName?: string;
  assetAuctionEndDate?: string;
  assetAuctionEndDateUtc?: string;
  lotNumber?: string;
  photo?: string;
  assetCategory?: string;
  categoryDescription?: string;
  isSoldAuction?: boolean;
  assetAttributeGroups?: Array<{
    name?: string;
    assetAttributes?: Array<{ label?: string; value?: string }>;
  }>;
}

export interface MaestroSourceOpts {
  businessId: string; // "GD" | "AD"
  categoryCodes: string[]; // product_category_external_id values OR'd together
  source: string; // deal source enum, e.g. "gov_auction"
  idPrefix: string; // namespaces source_deal_id, e.g. "gd" | "as"
  defaultSeller: string;
  label: string; // log prefix, e.g. "GovDeals"
  requireUS?: boolean; // AllSurplus lists internationally; drop non-US lots when true
  maxPages?: number;
}

// A trace UUID is required by the API but arbitrary; derive a deterministic one per page (no Math.random
// — keeps the call reproducible and avoids the runtime's RNG ban in some execution contexts).
function correlationId(seed: number): string {
  const h = (n: number, len: number) =>
    Math.abs(n).toString(16).padStart(len, "0").slice(0, len);
  return `${h(seed * 2654435761, 8)}-${h(seed * 40503, 4)}-4${h(seed * 911, 3)}-8${h(seed * 7919, 3)}-${h(seed * 1000003, 12)}`;
}

const US_STATE = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

function isUS(a: MaestroAsset): boolean {
  const c = (a.country || "").toUpperCase();
  if (c)
    return (
      c === "USA" ||
      c === "US" ||
      /united states/i.test(a.countryDescription || "")
    );
  // No country field => fall back to a clean 2-letter US state code (international states look like "ZA-GT").
  return US_STATE.has((a.locationState || "").toUpperCase());
}

function attrValue(a: MaestroAsset, label: RegExp): string | undefined {
  for (const group of a.assetAttributeGroups || []) {
    for (const attr of group.assetAttributes || []) {
      if (label.test(String(attr.label || ""))) return attr.value;
    }
  }
  return undefined;
}

function parseMileage(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >= 500 && raw <= 500000 ? Math.round(raw) : undefined;
  }
  const text = String(raw || "");
  if (/unknown|exempt|not\s+actual|not\s+available|n\/a/i.test(text)) {
    return undefined;
  }
  const match = text.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,6})\b/);
  if (!match) return undefined;
  const miles = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(miles) && miles >= 500 && miles <= 500000
    ? miles
    : undefined;
}

function detailMileage(a: MaestroAsset): number | undefined {
  if (/mile/i.test(String(a.meter || ""))) {
    const fromMeter = parseMileage(a.meterCount);
    if (fromMeter) return fromMeter;
  }
  return parseMileage(attrValue(a, /odometer|mileage|miles/i));
}

function detailVin(a: MaestroAsset): string | undefined {
  return (
    String(a.vinserial || attrValue(a, /^vin$/i) || "")
      .trim()
      .toUpperCase() || undefined
  );
}

function detailTitleType(a: MaestroAsset): string | undefined {
  return attrValue(a, /title/i);
}

/** Timeouts and body caps for the maestro API (Ren #316): a stuck or huge response can't stall the run. */
export const MAESTRO_SEARCH_TIMEOUT_MS = 30_000;
export const MAESTRO_DETAIL_TIMEOUT_MS = 15_000;
/** 120 fullResponse rows run a few hundred KB; 8 MB is far past any real page. */
export const MAESTRO_SEARCH_MAX_BYTES = 8 * 1024 * 1024;
export const MAESTRO_DETAIL_MAX_BYTES = 1024 * 1024;

async function readMaestroJson<T>(
  res: Response,
  max: number,
  label: string,
): Promise<T> {
  return JSON.parse(await readTextCapped(res, max, label)) as T;
}

export async function fetchMaestroDetail(
  a: MaestroAsset,
  businessId: string,
  fetchImpl: typeof fetch = fetch,
) {
  if (a.assetId == null || a.accountId == null) return null;
  const res = await fetchImpl(
    `${API.replace("/search/list", "")}/assets/${a.assetId}/${a.accountId}/false`,
    {
      method: "POST",
      signal: AbortSignal.timeout(MAESTRO_DETAIL_TIMEOUT_MS),
      headers: {
        ...HEADERS,
        "x-api-correlation-id": correlationId(Number(a.assetId) + 1000),
      },
      body: JSON.stringify({ businessId, siteId: "2" }),
    },
  );
  if (!res.ok) return null;
  return readMaestroJson<MaestroAsset>(
    res,
    MAESTRO_DETAIL_MAX_BYTES,
    "maestro detail",
  );
}

/** Map one maestro asset to a Deal. Returns null for non-vehicles / sold / (optionally) non-US rows. */
export function maestroAssetToDeal(
  a: MaestroAsset,
  opts: Pick<
    MaestroSourceOpts,
    "source" | "idPrefix" | "defaultSeller" | "requireUS"
  >,
): Partial<Deal> | null {
  const { assetId, accountId } = a;
  if (assetId == null || accountId == null) return null;
  if (a.isSoldAuction) return null; // closed lot, not a live lead
  if (opts.requireUS && !isUS(a)) return null;

  const year = a.modelYear ? parseInt(a.modelYear, 10) : undefined;
  if (!year || year < 1950 || year > 2030) return null; // model year => a real titled vehicle

  // currentBid is the live high bid (acquisition cost). Fall back to the opening bid price.
  const price = Math.round(Number(a.currentBid ?? a.assetBidPrice ?? 0));
  if (!price || price < 1) return null; // no live bid value => not a usable lead yet

  const title =
    (a.assetShortDescription || "").trim() ||
    [a.modelYear, a.makebrand, a.model].filter(Boolean).join(" ");
  // Cars and trucks only: no trailers, buses, boats, aircraft, equipment or heavy trucks.
  if (!isCarOrTruck(`${title} ${a.makebrand || ""} ${a.model || ""}`))
    return null;

  // A7: build the full image URL from the photo filename. Strip any `?cb=` cache-buster for a canonical URL.
  const photoFile = (a.photo || "").split("?")[0].trim();
  const images = photoFile ? [`${IMAGE_BASE}/${accountId}/${photoFile}`] : [];

  return {
    source: opts.source,
    // assetId is unique per lot but namespaced per account; combine (+ prefix) to be globally unique.
    source_deal_id: `${opts.idPrefix}-${assetId}-${accountId}`,
    source_url: `https://www.govdeals.com/asset/${assetId}/${accountId}`,
    title,
    year,
    make: (a.makebrand || "").trim(),
    model: (a.model || "").trim(),
    ask_price: price,
    condition: "run_drive", // surplus; condition varies, treat as running unless the lot says otherwise
    location_city: a.locationCity?.trim() || undefined,
    location_state: a.locationState?.trim() || undefined,
    location_zip: a.locationZip?.trim() || undefined,
    seller_type: "auction",
    seller: (a.companyName || a.displaySellerName || opts.defaultSeller).trim(),
    vin: detailVin(a),
    mileage: detailMileage(a),
    trim: attrValue(a, /^trim$/i),
    bid_count: typeof a.bidCount === "number" ? a.bidCount : undefined,
    auction_end: a.assetAuctionEndDateUtc || a.assetAuctionEndDate || undefined,
    images,
    metadata: {
      auction: true,
      channel: "gov_surplus",
      marketplace: opts.idPrefix === "as" ? "allsurplus" : "govdeals",
      lotNumber: a.lotNumber,
      ...(detailTitleType(a) ? { titleType: detailTitleType(a) } : {}),
      ...(a.meterAccurate ? { meterAccurate: a.meterAccurate } : {}),
    },
    scraped_at: new Date().toISOString(),
  };
}

/**
 * GovDeals/AllSurplus sold-price capture. Default ON: an accepted risk, operator decision by Jonah on
 * 2026-10-10 (docs/legal/republish-policy.md, "Accepted risks"). Set SOLD_CAPTURE_LQDT=0 to stop
 * writing these rows; live GovDeals/AllSurplus deal scraping is unaffected either way.
 */
export function soldCaptureLqdtEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = (env.SOLD_CAPTURE_LQDT ?? "").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

/**
 * A lot the venue itself marks sold (`isSoldAuction`) → a sold comp. These used to be dropped by
 * maestroAssetToDeal (correctly: a closed lot is not a live lead), which threw the sale price away.
 * The price is the winning bid before the buyer's premium; the source is labelled per marketplace
 * and the channel is gov_surplus_auction so it never reads as a retail price. No photos, no seller.
 */
export function maestroAssetToSoldComp(
  a: MaestroAsset,
  opts: Pick<MaestroSourceOpts, "idPrefix" | "requireUS">,
  now = new Date(),
): SoldListingInsert | null {
  if (!a.isSoldAuction) return null;
  const { assetId, accountId } = a;
  if (assetId == null || accountId == null) return null;
  if (opts.requireUS && !isUS(a)) return null;
  const year = a.modelYear ? parseInt(a.modelYear, 10) : NaN;
  if (!year || year < 1950 || year > now.getFullYear() + 1) return null;
  const price = Math.round(Number(a.currentBid ?? 0));
  if (!price || price < 100 || price > 500_000) return null;
  const ended = a.assetAuctionEndDateUtc || a.assetAuctionEndDate;
  const endedAt = ended ? new Date(ended) : null;
  if (!endedAt || Number.isNaN(endedAt.getTime()) || endedAt > now) return null;
  const title =
    (a.assetShortDescription || "").trim() ||
    [a.modelYear, a.makebrand, a.model].filter(Boolean).join(" ");
  const make = (a.makebrand || "").trim() || null;
  const model = (a.model || "").trim() || null;
  if (!isCarOrTruck(`${title} ${make || ""} ${model || ""}`)) return null;
  if (!isLightVehicleComp(make, model, title)) return null;
  const marketplace = opts.idPrefix === "as" ? "allsurplus" : "govdeals";
  const venue = marketplace === "allsurplus" ? "AllSurplus" : "GovDeals";
  const vin = detailVin(a);
  const state = (a.locationState || "").trim().toUpperCase();
  return {
    vin: vin || null,
    year,
    make,
    model,
    trim: attrValue(a, /^trim$/i) || null,
    mileage: detailMileage(a) ?? null,
    sold_price: price,
    sold_at: endedAt.toISOString(),
    title:
      `${title} (${venue} sold lot, winning bid before buyer's premium)`.slice(
        0,
        180,
      ),
    source: marketplace,
    source_item_id: `${opts.idPrefix}-${assetId}-${accountId}`,
    source_url: `https://www.${marketplace}.com/asset/${assetId}/${accountId}`,
    currency_code: "USD",
    country_code: "US",
    location_state: /^[A-Z]{2}$/.test(state) ? state : null,
    basis: "sold",
    sale_channel: "gov_surplus_auction",
    attribution: `${venue} (Liquidity Services) lot page; facts only, linked back`,
  };
}

/** Write sold lots as comps. Best-effort: never fails the live-lot scrape. Skipped in cache-only mode. */
async function saveMaestroSoldComps(
  comps: SoldListingInsert[],
  label: string,
): Promise<number> {
  if (!comps.length) return 0;
  const context = getLocalWriteContext();
  if (context?.cacheOnly) {
    console.log(
      `[${label}] ${comps.length} sold lots seen; cache-only mode, no Supabase writes`,
    );
    return 0;
  }
  try {
    const sb = context?.supabase || createServerComponentClient();
    const res = await writeSoldListings(sb, comps);
    if (res.skipped)
      console.warn(`[${label}] sold comps not written: ${res.skipped}`);
    else
      console.log(
        `[${label}] sold comps: ${res.written} new of ${res.attempted}`,
      );
    return res.written;
  } catch (e) {
    console.warn(`[${label}] sold comps write failed:`, (e as Error).message);
    return 0;
  }
}

export async function fetchMaestroPage(
  businessId: string,
  categoryCodes: string[],
  page: number,
  displayRows: number,
  fetchImpl: typeof fetch = fetch,
): Promise<MaestroAsset[]> {
  const body = {
    businessId,
    searchText: "*",
    isQAL: false,
    page,
    displayRows,
    sortField: "timeremaining", // ending-soonest first => freshest, most actionable leads
    sortOrder: "asc",
    requestType: "search",
    responseStyle: "fullResponse",
    facetsFilter: categoryCodes.map(
      (c) =>
        `{!tag=product_category_external_id}product_category_external_id:"${c}"`,
    ),
    accountIds: [],
  };
  const res = await fetchImpl(API, {
    method: "POST",
    headers: { ...HEADERS, "x-api-correlation-id": correlationId(page + 1) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MAESTRO_SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await readMaestroJson<{ assetSearchResults?: MaestroAsset[] }>(
    res,
    MAESTRO_SEARCH_MAX_BYTES,
    "maestro search",
  );
  return json.assetSearchResults || [];
}

/**
 * Walk the maestro pages for a category set and return the RAW assets (deduped by assetId). Mapper-
 * agnostic, so BOTH verticals reuse the exact fetch/pagination/pacing: cars map assets→Deal, HomeIQ maps
 * the same assets→Property (different categories: 95B/95F/959 real estate vs 94A/94Q vehicles).
 */
export async function fetchMaestroAssets(
  businessId: string,
  categoryCodes: string[],
  opts: { maxPages?: number; label?: string } = {},
): Promise<MaestroAsset[]> {
  const DISPLAY_ROWS = 120;
  const maxPages = opts.maxPages ?? 8;
  const label = opts.label || businessId;
  const byId = new Map<number, MaestroAsset>();
  let prevFirst = "";

  for (let page = 1; page <= maxPages; page++) {
    let rows: MaestroAsset[];
    try {
      rows = await fetchMaestroPage(
        businessId,
        categoryCodes,
        page,
        DISPLAY_ROWS,
      );
    } catch (e) {
      console.warn(`[${label}] page ${page} failed:`, (e as Error).message);
      break;
    }
    if (!rows.length) break;

    // The API loops back to page 1 past the last real page — stop when the first lot repeats.
    const first = String(rows[0]?.assetId ?? "");
    if (first && first === prevFirst) break;
    prevFirst = first;

    for (const r of rows) if (r.assetId != null) byId.set(r.assetId, r);
    if (rows.length < DISPLAY_ROWS) break; // last page
    await new Promise((r) => setTimeout(r, 800)); // be polite to the public API
  }
  return Array.from(byId.values());
}

/** Generic maestro scrape loop (vehicles), shared by GovDeals + AllSurplus. */
export async function scrapeMaestro(opts: MaestroSourceOpts): Promise<number> {
  console.log(`[${opts.label}] Starting scrape...`);
  const assets = await fetchMaestroAssets(opts.businessId, opts.categoryCodes, {
    maxPages: opts.maxPages,
    label: opts.label,
  });
  const byId = new Map<string, Partial<Deal>>();
  const soldComps = new Map<string, SoldListingInsert>();
  const captureSold = soldCaptureLqdtEnabled();
  const detailLimit = Math.max(
    0,
    Math.min(200, Number(process.env.MAESTRO_DETAIL_LIMIT || 60) || 0),
  );
  let enriched = 0;
  for (let index = 0; index < assets.length; index++) {
    const r = assets[index];
    let row = r;
    if (index < detailLimit) {
      try {
        const detail = await fetchMaestroDetail(r, opts.businessId);
        if (detail) {
          row = { ...r, ...detail };
          enriched++;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      } catch {
        // Detail enrichment is best-effort; the search row remains usable.
      }
    }
    const deal = maestroAssetToDeal(row, opts);
    if (deal) byId.set(deal.source_deal_id!, deal);
    if (captureSold) {
      const sold = maestroAssetToSoldComp(row, opts);
      if (sold) soldComps.set(sold.source_item_id, sold);
    }
  }
  if (captureSold)
    await saveMaestroSoldComps(Array.from(soldComps.values()), opts.label);
  if (enriched) {
    console.log(
      `[${opts.label}] Enriched ${enriched}/${Math.min(detailLimit, assets.length)} detail assets (VIN/mileage/title)`,
    );
  }
  const deals = Array.from(byId.values());
  console.log(`[${opts.label}] Found ${deals.length} vehicle auctions`);
  return deals.length > 0 ? upsertDeals(deals) : 0;
}
