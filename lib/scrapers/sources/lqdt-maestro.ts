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
import { load } from "cheerio";
import { isCarOrTruck } from "../vehicle-class";
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
  auctionId?: number;
  assetShortDescription?: string;
  assetLongDescription?: string | null;
  assetShortDesc?: string;
  assetLongDesc?: string | null;
  assetPhotos?: string[];
  titleRestrictionText?: string | null;
  titleRestriction?: string | null;
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
  if (
    /^(unknown|no|not actual|exempt)$/i.test(
      String(a.meterAccurate || "").trim(),
    )
  )
    return undefined;
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
  return [a.titleRestrictionText, a.titleRestriction, attrValue(a, /title/i)]
    .map((value) => String(value || "").trim())
    .find(Boolean);
}

function descriptionText(a: MaestroAsset): string {
  const $ = load(
    String(a.assetLongDesc || a.assetLongDescription || "").replace(
      /<br\s*\/?>/gi,
      "\n",
    ),
  );
  $("script,style,iframe,noscript").remove();
  return $.root().text().replace(/\r/g, "").trim().slice(0, 12000);
}

function assetImages(a: MaestroAsset): string[] {
  const account = String(a.accountId);
  const images = new Set<string>();
  for (const value of [
    a.photo,
    ...(Array.isArray(a.assetPhotos) ? a.assetPhotos : []),
  ]) {
    if (typeof value !== "string") continue;
    const raw = value.split(/[?#]/)[0].trim();
    const file = raw.match(
      new RegExp(
        `^(?:https://webassets\\.lqdt1\\.com/assets/photos/${account}/|/photos/${account}/)?(${account}_${a.assetId}_[a-zA-Z0-9_-]+\\.(?:jpg|jpeg|png|webp))$`,
        "i",
      ),
    )?.[1];
    if (file) images.add(`${IMAGE_BASE}/${account}/${file}`);
    if (images.size === 20) break; // Preserve the existing catalogue gallery bound.
  }
  return Array.from(images);
}

function statedTitleCondition(title: string | undefined): string | undefined {
  // This enum cannot represent buyback titles. Preserve the disclosure without
  // coercing it to clean/salvage or inventing an operability claim.
  const value = title?.trim().toLowerCase();
  if (/^(clean|clear)(?: title)?$/.test(value || "")) return "clean_title";
  if (/^(rebuilt|prior salvage)(?: title)?$/.test(value || ""))
    return "rebuilt_title";
  if (/^salvage(?: title)?$/.test(value || "")) return "salvage_title";
  return undefined;
}

async function fetchMaestroDetail(a: MaestroAsset, businessId: string) {
  if (a.assetId == null || a.accountId == null) return null;
  const res = await fetch(
    `${API.replace("/search/list", "")}/assets/${a.assetId}/${a.accountId}/false`,
    {
      method: "POST",
      headers: {
        ...HEADERS,
        "x-api-correlation-id": correlationId(Number(a.assetId) + 1000),
      },
      body: JSON.stringify({ businessId, siteId: "2" }),
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as MaestroAsset;
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
  if (!Number.isFinite(price) || price < 1) return null; // no live bid value => not a usable lead yet

  const title =
    (a.assetShortDesc || a.assetShortDescription || "").trim() ||
    [a.modelYear, a.makebrand, a.model].filter(Boolean).join(" ");
  // Cars and trucks only: no trailers, buses, boats, aircraft, equipment or heavy trucks.
  if (!isCarOrTruck(`${title} ${a.makebrand || ""} ${a.model || ""}`))
    return null;

  const description = descriptionText(a);
  const buyback = /\btitle\s+(?:is\s+)?branded\s+buyback\b/i.test(description);
  const titleType = buyback ? "Buyback (seller-reported)" : detailTitleType(a);
  const condition = statedTitleCondition(titleType);
  const images = assetImages(a);
  const metadata = {
    auction: true,
    channel: "gov_surplus",
    marketplace: opts.idPrefix === "as" ? "allsurplus" : "govdeals",
    lotNumber: a.lotNumber,
    ...(titleType ? { titleType } : {}),
    ...(a.meterAccurate ? { meterAccurate: a.meterAccurate } : {}),
  };

  return {
    source: opts.source,
    // assetId is unique per lot but namespaced per account; combine (+ prefix) to be globally unique.
    source_deal_id: `${opts.idPrefix}-${assetId}-${accountId}`,
    source_url: `https://www.${opts.idPrefix === "as" ? "allsurplus" : "govdeals"}.com/asset/${assetId}/${accountId}`,
    title,
    year,
    make: (a.makebrand || "").trim(),
    model: (a.model || "").trim(),
    ask_price: price,
    condition,
    ...(condition ? { title_source: "listing" as const } : {}),
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
    description,
    metadata,
    options: {
      ...metadata,
      description,
      auction: { marketplace: metadata.marketplace, lotNumber: a.lotNumber },
      priceEvidence: {
        kind: "current_bid",
        listedAmount: price,
        evidenceText: "Source-reported auction bid; not a cash asking price.",
      },
      ...(a.meterCount != null
        ? {
            reportedOdometer: {
              value: a.meterCount,
              unit: a.meter,
              accuracy: a.meterAccurate || "Not reported",
            },
          }
        : {}),
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
 * Walk the maestro pages for a category set and return the RAW assets (deduped by account + asset). Mapper-
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
  const byId = new Map<string, MaestroAsset>();
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
    const first =
      rows[0]?.assetId != null && rows[0]?.accountId != null
        ? `${rows[0].accountId}:${rows[0].assetId}`
        : "";
    if (first && first === prevFirst) break;
    prevFirst = first;

    for (const r of rows)
      if (r.assetId != null && r.accountId != null)
        byId.set(`${r.accountId}:${r.assetId}`, r);
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
        if (
          detail &&
          detail.assetId === r.assetId &&
          detail.accountId === r.accountId
        ) {
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
  }
  if (enriched) {
    console.log(
      `[${opts.label}] Enriched ${enriched}/${Math.min(detailLimit, assets.length)} detail assets (VIN/mileage/title)`,
    );
  }
  const deals = Array.from(byId.values());
  console.log(`[${opts.label}] Found ${deals.length} vehicle auctions`);
  return deals.length > 0 ? upsertDeals(deals) : 0;
}
