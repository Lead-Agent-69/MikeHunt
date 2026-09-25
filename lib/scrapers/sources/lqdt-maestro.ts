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
import { upsertDeals } from "../pipeline";

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
  assetShortDescription?: string;
  makebrand?: string;
  model?: string;
  modelYear?: string;
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
    bid_count: typeof a.bidCount === "number" ? a.bidCount : undefined,
    auction_end: a.assetAuctionEndDateUtc || a.assetAuctionEndDate || undefined,
    images,
    metadata: {
      auction: true,
      channel: "gov_surplus",
      marketplace: opts.idPrefix === "as" ? "allsurplus" : "govdeals",
      lotNumber: a.lotNumber,
    },
    scraped_at: new Date().toISOString(),
  };
}

async function fetchMaestroPage(
  businessId: string,
  categoryCodes: string[],
  page: number,
  displayRows: number,
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
  const res = await fetch(API, {
    method: "POST",
    headers: { ...HEADERS, "x-api-correlation-id": correlationId(page + 1) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { assetSearchResults?: MaestroAsset[] };
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
  for (const r of assets) {
    const deal = maestroAssetToDeal(r, opts);
    if (deal) byId.set(deal.source_deal_id!, deal);
  }
  const deals = Array.from(byId.values());
  console.log(`[${opts.label}] Found ${deals.length} vehicle auctions`);
  if (deals.length > 0) await upsertDeals(deals);
  return deals.length;
}
