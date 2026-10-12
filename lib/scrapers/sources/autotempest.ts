// lib/scrapers/sources/autotempest.ts
// Autotempest is a meta-search ENGINE — one query fans out to Cars.com, CarGurus, Carvana, eBay,
// AutoTrader, TrueCar, CarMax, Facebook Marketplace, Hemmings, AutoByTel and more, then returns a
// single clean JSON feed (vin/year/make/model/trim/price/mileage/title/url + which site each came
// from). Its public results API (no login, no FlareSolverr) lets us pull MANY car-selling sites
// "under one roof" in one shot — including the ones whose own sites are bot-walled (CarMax, Cars.com,
// Facebook, TrueCar). Each listing is stored under its TRUE origin source (cars_com/cargurus/carvana/
// ebay_motors/autotrader/truecar/facebook_marketplace) so it flows into retail comps correctly; the
// origin is also kept in metadata.origin_site. A unique aggregator id keeps it from colliding with
// our direct scrapers' rows.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";
import { STATE_SEED_ZIPS, US_STATES } from "@/lib/geo";
import { getSweepPlan, sweepPlanZips, type SweepPlan } from "../sweep-plan";
import { getScrapeRunScope } from "../run-scope-context";
import { buyerSearchCenters } from "../search-centers";
import type { BuyerScope } from "../buyer-scope";
import { normalizeCondition } from "../normalize-condition";
import {
  disclosedPriceEvidence,
  positivePrice,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";

const API = "https://www.autotempest.com/api/search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Site codes Autotempest accepts; we ask for the whole network and keep whatever responds.
const SITES =
  "ah|at|cab|cg|cgc|cm|cs|ct|cv|eb|ebcom|fbm|hem|hemc|kj|ot|pa|ssm|st|tc|te";

// Broad market coverage — popular makes (model-less searches still return multiple sites). A handful
// of make+model combos pull the slower walled sites (CarMax/Carvana/TrueCar) too.
const QUERIES: Array<{ make: string; model?: string }> = [
  { make: "ford", model: "f150" },
  { make: "chevrolet", model: "silverado" },
  { make: "ram", model: "1500" },
  { make: "toyota", model: "camry" },
  { make: "toyota", model: "tacoma" },
  { make: "honda", model: "accord" },
  { make: "honda", model: "civic" },
  { make: "jeep", model: "wrangler" },
  { make: "nissan", model: "altima" },
  { make: "bmw" },
  { make: "subaru" },
  { make: "hyundai" },
  { make: "kia" },
  { make: "gmc" },
  { make: "lexus" },
];

const num = (v: unknown): number =>
  Number(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;
const s = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

function usdAmount(value: unknown): number | undefined {
  if (typeof value === "number") return positivePrice(value);
  if (typeof value !== "string") return undefined;
  const match =
    /^(?:(?:US|USD)\s*)?\$?\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:down|\/\s*mo(?:nth)?|per\s+month|a\s+month))?\s*$/i.exec(
      value.trim(),
    );
  return match ? positivePrice(match[1].replace(/,/g, "")) : undefined;
}

// Map an Autotempest origin (sourceName) to our deal_source enum. Substring match so "Cars.com",
// "eBay Motors", etc. all resolve. Origins without a direct enum (CarMax, Hemmings, AutoByTel) fall to
// 'independent_dealer' (they're dealer/retail) — the true name is still kept in metadata + seller.
export function mapOriginToSource(sourceName: string): Deal["source"] {
  const n = sourceName.toLowerCase();
  if (n.includes("carvana")) return "carvana";
  // Whole word only: "ClassicCars.com" is not Cars.com.
  if (/(^|[^a-z0-9])cars\.com\b/.test(n)) return "cars_com";
  if (n.includes("cargurus")) return "cargurus";
  if (n.includes("autotrader")) return "autotrader";
  if (n.includes("ebay")) return "ebay_motors";
  if (n.includes("truecar")) return "truecar";
  if (n.includes("facebook")) return "facebook_marketplace";
  if (n.includes("craigslist")) return "craigslist";
  return "independent_dealer";
}

function titleToCondition(t?: string): Deal["condition"] {
  if (
    /\b(clean|clear)\b/i.test(t || "") &&
    !/^(clean|clear)(?:[\s_-]+title)?$/i.test((t || "").trim())
  )
    return undefined;
  return normalizeCondition(t) as Deal["condition"];
}

/** Parse an Autotempest results payload (json.results[]) into deal rows. */
export function parseAutotempest(json: any): Partial<Deal>[] {
  const results = json?.results;
  if (!Array.isArray(results)) return [];
  const items: Partial<Deal>[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const currency = s(r.currencyCode) || s(r.currency);
    if (currency && !/^(USD|US dollar(?:s)?)$/i.test(currency)) continue;
    const price = usdAmount(r.price);
    const id = s(r.id) || s(r.externalId);
    if (!price || !id) continue;

    const year = parseInt(String(r.year), 10) || undefined;
    const make = s(r.make);
    const model = s(r.model);
    const trim = s(r.trim);
    const [city, state] = String(r.location || "")
      .split(",")
      .map((p) => p.trim());
    const origin = s(r.sourceName) || "Autotempest";
    const url = s(r.url);
    const title =
      s(r.title) ||
      `${year || ""} ${make || ""} ${model || ""} ${trim || ""}`
        .replace(/\s+/g, " ")
        .trim();
    const sellerType = /^private(?:\s+seller)?$/i.test(s(r.sellerType) || "")
      ? "private"
      : /^dealer$/i.test(s(r.sellerType) || "")
        ? "dealer"
        : undefined;
    const originSource = mapOriginToSource(origin);
    let dealerChannel = false;
    if (originSource === "craigslist" && url) {
      try {
        const listingUrl = new URL(url);
        dealerChannel =
          /(^|\.)craigslist\.org$/i.test(listingUrl.hostname) &&
          /^\/ctd\//i.test(listingUrl.pathname);
      } catch {
        /* Invalid URLs do not establish a seller channel. */
      }
    }
    const source =
      originSource === "craigslist" &&
      (sellerType === "dealer" || dealerChannel)
        ? "craigslist_dealer"
        : originSource;
    const condition = titleToCondition(s(r.vehicleTitle));
    const currentBid = usdAmount(r.currentBid);
    const buyNow = usdAmount(r.buyNowPrice);
    const disclosed = disclosedPriceEvidence(
      `${title} ${String(r.price || "")} ${s(r.description) || ""}`,
      price,
    );
    const priceEvidence: PriceEvidence | undefined =
      disclosed ||
      (currentBid
        ? { kind: "current_bid", currentBid, buyNow, listedAmount: price }
        : buyNow
          ? { kind: "buy_now", buyNow, listedAmount: price }
          : source === "craigslist_dealer"
            ? {
                kind: "unknown",
                listedAmount: price,
                evidenceText:
                  "Full cash price has not been checked on the source listing.",
              }
            : undefined);

    items.push({
      source,
      source_deal_id: `at-${id}`, // aggregator-prefixed so it never collides with direct scrapers

      source_url: url || "",
      title,
      year,
      make,
      model,
      trim,
      vin: s(r.vin),
      ask_price: price,
      buy_now_price: buyNow,
      mileage: num(r.mileage),
      condition,
      title_source: condition ? "listing" : undefined,
      options: {
        aggregator: "autotempest",
        originSite: origin,
        ...(priceEvidence ? { priceEvidence } : {}),
      },
      images: s(r.img) ? [String(r.img).replace(/^\/\//, "https://")] : [],
      seller_type: sellerType,
      seller: s(r.sellerName) || s(r.dealerName),
      location_city: city || undefined,
      location_state:
        state && [...US_STATES, "DC"].includes(state.toUpperCase())
          ? state.toUpperCase()
          : undefined,
      metadata: {
        aggregator: "autotempest",
        origin_site: origin,
        origin_sitecode: s(r.sitecode),
        deal_gauge: s(r.dealGaugeClass) || undefined,
        current_bid: num(r.currentBid) || undefined,
      },
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

// One page of a query. Returns the parsed rows + the Elasticsearch-style `searchAfter` cursor to
// fetch the next page (null when there's nothing more to page through).
async function fetchPage(
  q: { make: string; model?: string },
  zip: string,
  cursor: unknown[] | null,
  radius = 13000,
): Promise<{ items: Partial<Deal>[]; cursor: unknown[] | null }> {
  const params = new URLSearchParams({
    make: q.make,
    ...(q.model ? { model: q.model } : {}),
    zip,
    radius: String(radius), // 13000 = nationwide (API max); smaller = state-local coverage
    rpp: "50",
    srpp: "50",
    sort: "date_desc",
    sites: SITES,
    deduplicationSites: SITES,
  });
  if (cursor) params.set("searchAfter", JSON.stringify(cursor));

  const res = await fetch(`${API}?${params.toString()}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://www.autotempest.com/results",
    },
  });
  if (!res.ok) {
    console.warn(`[Autotempest] ${q.make} ${q.model || ""} HTTP ${res.status}`);
    return { items: [], cursor: null };
  }
  const json = await res.json();
  const next = Array.isArray(json?.searchAfter) ? json.searchAfter : null;
  return { items: parseAutotempest(json), cursor: next };
}

// Page through one query via searchAfter until it runs dry, the cursor stops advancing, or we hit
// the page cap — this is what multiplies yield from the responsive sites (Cars.com/Carvana/CarGurus/
// eBay). The slow live-fetch sites (TrueCar/Facebook/AutoTrader) still trickle in via the sites list.
async function harvestQuery(
  q: { make: string; model?: string },
  zip: string,
  byId: Map<string, Partial<Deal>>,
  maxPages: number,
  radius = 13000,
): Promise<void> {
  let cursor: unknown[] | null = null;
  let prevKey = "";
  for (let page = 0; page < maxPages; page++) {
    const { items, cursor: next } = await fetchPage(q, zip, cursor, radius);
    if (!items.length) break;
    for (const it of items) byId.set(it.source_deal_id!, it);
    const key = next ? JSON.stringify(next) : "";
    if (!next || key === prevKey) break; // cursor exhausted / not advancing
    prevKey = key;
    cursor = next;
    await new Promise((r) => setTimeout(r, 900)); // be polite to the aggregator
  }
}

// Broad makes that exist in every state — used for the regional coverage pass.
const REGIONAL_MAKES = ["ford", "chevrolet", "toyota"];
const REGIONAL_RADIUS = 250; // miles — pulls state-local + neighboring inventory
const ZIPS_PER_RUN = 12; // rotate a window of state zips so all 50 are covered every ~4 runs

/**
 * Regional-pass search centers: every planned metro during a Docker sweep (so the rotation reaches
 * every state), else a random window of ZIPS_PER_RUN state seeds (the old behavior).
 */
export function autotempestRegionalZips(
  plan: SweepPlan | undefined = getSweepPlan(),
  random = Math.random,
  scope: BuyerScope | undefined = getScrapeRunScope(),
): string[] {
  if (scope?.state || scope?.states?.length) return buyerSearchCenters(scope);
  const planned = sweepPlanZips(plan);
  if (planned.length) return planned;
  const stateZips = Object.values(STATE_SEED_ZIPS).filter(Boolean) as string[];
  const start = Math.floor(random() * stateZips.length);
  return Array.from(
    { length: Math.min(ZIPS_PER_RUN, stateZips.length) },
    (_, i) => stateZips[(start + i) % stateZips.length],
  );
}

export function autotempestBuyerQueries(
  scope: BuyerScope,
): Array<{ make: string; model?: string }> {
  const makes = Array.from(
    new Set(
      [scope.make, ...(scope.makes || [])].filter((make): make is string =>
        Boolean(make),
      ),
    ),
  );
  if (makes.length)
    return makes.map((make) => ({
      make: make.toLowerCase(),
      ...(scope.model ? { model: scope.model } : {}),
    }));
  // Category-only searches must not inherit the background sweep's preset truck/sedan models.
  return Array.from(new Set(QUERIES.map((query) => query.make))).map(
    (make) => ({ make, ...(scope.model ? { model: scope.model } : {}) }),
  );
}

export async function scrapeAutotempest(maxPagesPerQuery = 3): Promise<number> {
  console.log("[Autotempest] Starting aggregator scrape...");
  const stateZips = Object.values(STATE_SEED_ZIPS).filter(Boolean) as string[];
  const nationalZip =
    stateZips[Math.floor(Math.random() * stateZips.length)] || "75201";

  const byId = new Map<string, Partial<Deal>>();
  const scope = getScrapeRunScope();
  if (scope?.state || scope?.states?.length) {
    for (const zip of autotempestRegionalZips(undefined, Math.random, scope)) {
      for (const query of autotempestBuyerQueries(scope)) {
        try {
          await harvestQuery(
            query,
            zip,
            byId,
            maxPagesPerQuery,
            REGIONAL_RADIUS,
          );
        } catch (error) {
          console.warn(
            `[Autotempest] scoped ${query.make}@${zip} failed:`,
            (error as Error).message,
          );
        }
      }
    }
    const scopedDeals = Array.from(byId.values());
    return scopedDeals.length ? upsertDeals(scopedDeals) : 0;
  }

  // Pass 1 — NATIONAL: deep-paginated make/model queries for comp volume (mostly Cars.com/eBay).
  for (const q of QUERIES) {
    try {
      await harvestQuery(q, nationalZip, byId, maxPagesPerQuery, 13000);
    } catch (e) {
      console.warn(
        `[Autotempest] national ${q.make} ${q.model || ""} failed:`,
        (e as Error).message,
      );
    }
  }

  // Pass 2 — REGIONAL: tight-radius local inventory. In a Docker sweep this follows the state
  // rotation (every planned metro); otherwise a random window of state seeds.
  for (const zip of autotempestRegionalZips()) {
    for (const make of REGIONAL_MAKES) {
      try {
        await harvestQuery({ make }, zip, byId, 1, REGIONAL_RADIUS);
      } catch (e) {
        console.warn(
          `[Autotempest] regional ${make}@${zip} failed:`,
          (e as Error).message,
        );
      }
    }
  }

  const deals = Array.from(byId.values());
  const withState = deals.filter((d) => d.location_state).length;
  console.log(
    `[Autotempest] Found ${deals.length} listings (${withState} with state)`,
  );
  return deals.length > 0 ? upsertDeals(deals) : 0;
}
