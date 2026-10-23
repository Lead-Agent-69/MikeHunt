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
import type { ScraperArgs } from "../tools/registry";

const API = "https://www.autotempest.com/api/search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Site codes Autotempest accepts; we ask for the whole network and keep whatever responds.
const SITES =
  "ah|at|cab|cg|cgc|cm|cs|ct|cv|eb|ebcom|fbm|hem|hemc|kj|ot|pa|ssm|st|tc|te";

// Leave enough of the executor's five-minute source deadline for validation,
// geocoding, cache classification, and bounded database writes. A successful
// partial run is more useful than collecting thousands of rows and losing the
// whole result at the deadline.
const PERSISTENCE_RESERVE_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS_PER_RUN = 1_000;
const MAX_RESULTS_PER_RUN = 2_000;

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

function sourceListingUrl(value: unknown): string | undefined {
  const raw = s(value);
  if (!raw) return undefined;
  try {
    const url = raw.startsWith("/") ? new URL(raw, API) : new URL(raw);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

const TRACKING_QUERY_PARAM =
  /^(?:utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid|ref|referrer)$/i;

/**
 * Identity for one origin listing across aggregator queries and pages.
 * AutoTempest can return the same retailer URL with a different aggregator id
 * or tracking query string, so its result id alone is not a stable dedupe key.
 */
export function autotempestListingKey(deal: Partial<Deal>): string {
  const source = String(deal.source || "unknown").toLowerCase();
  const rawUrl = sourceListingUrl(deal.source_url);
  if (rawUrl) {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_QUERY_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, "");
    return `${source}|url:${url.toString()}`;
  }

  return `${source}|id:${String(deal.source_deal_id || deal.id || "")}`;
}

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
    const url = sourceListingUrl(r.url);
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
  signal?: AbortSignal,
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
    signal,
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
  control: {
    signal?: AbortSignal;
    deadlineAt?: number;
    maxResults: number;
  },
): Promise<boolean> {
  let cursor: unknown[] | null = null;
  let prevKey = "";
  for (let page = 0; page < maxPages; page++) {
    const persistenceDeadline =
      control.deadlineAt != null
        ? control.deadlineAt - PERSISTENCE_RESERVE_MS
        : undefined;
    if (
      control.signal?.aborted ||
      byId.size >= control.maxResults ||
      (persistenceDeadline != null && Date.now() >= persistenceDeadline)
    )
      return false;
    const requestTimeout = AbortSignal.timeout(
      Math.max(
        1,
        Math.min(
          REQUEST_TIMEOUT_MS,
          persistenceDeadline != null
            ? persistenceDeadline - Date.now()
            : REQUEST_TIMEOUT_MS,
        ),
      ),
    );
    const requestSignal = control.signal
      ? AbortSignal.any([control.signal, requestTimeout])
      : requestTimeout;
    const { items, cursor: next } = await fetchPage(
      q,
      zip,
      cursor,
      radius,
      requestSignal,
    );
    if (!items.length) return true;
    for (const it of items) {
      const key = autotempestListingKey(it);
      if (!byId.has(key)) byId.set(key, it);
    }
    if (byId.size >= control.maxResults) return false;
    const key = next ? JSON.stringify(next) : "";
    if (!next || key === prevKey) return true; // cursor exhausted / not advancing
    prevKey = key;
    cursor = next;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(control.signal?.reason || new Error("Aborted"));
      };
      const timer = setTimeout(() => {
        control.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, 900); // be polite to the aggregator
      if (control.signal?.aborted) onAbort();
      else control.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  return true;
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

/** Rotate the first national query so a bounded run does not starve later makes. */
export function autotempestQueryOrder(
  slot = Math.floor(Date.now() / (4 * 60 * 60 * 1000)),
) {
  const start =
    (((slot * 7) % QUERIES.length) + QUERIES.length) % QUERIES.length;
  return [...QUERIES.slice(start), ...QUERIES.slice(0, start)];
}

function resultLimit() {
  const configured = Number(process.env.AUTOTEMPEST_MAX_RESULTS_PER_RUN);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(MAX_RESULTS_PER_RUN, Math.floor(configured))
    : DEFAULT_MAX_RESULTS_PER_RUN;
}

export async function scrapeAutotempest(
  maxPagesPerQuery = 3,
  args: Pick<ScraperArgs, "abortSignal" | "deadlineAt"> = {},
): Promise<number> {
  console.log("[Autotempest] Starting aggregator scrape...");
  const stateZips = Object.values(STATE_SEED_ZIPS).filter(Boolean) as string[];
  const nationalZip =
    stateZips[Math.floor(Math.random() * stateZips.length)] || "75201";

  const byId = new Map<string, Partial<Deal>>();
  const control = {
    signal: args.abortSignal,
    deadlineAt: args.deadlineAt,
    maxResults: resultLimit(),
  };
  const scope = getScrapeRunScope();
  if (scope?.state || scope?.states?.length) {
    for (const zip of autotempestRegionalZips(undefined, Math.random, scope)) {
      for (const query of autotempestBuyerQueries(scope)) {
        try {
          const complete = await harvestQuery(
            query,
            zip,
            byId,
            maxPagesPerQuery,
            REGIONAL_RADIUS,
            control,
          );
          if (!complete) break;
        } catch (error) {
          if (args.abortSignal?.aborted) throw error;
          console.warn(
            `[Autotempest] scoped ${query.make}@${zip} failed:`,
            (error as Error).message,
          );
        }
      }
      if (
        byId.size >= control.maxResults ||
        (args.deadlineAt != null &&
          Date.now() + PERSISTENCE_RESERVE_MS >= args.deadlineAt)
      )
        break;
    }
    const scopedDeals = Array.from(byId.values()).slice(0, control.maxResults);
    return scopedDeals.length ? upsertDeals(scopedDeals) : 0;
  }

  // Pass 1 — REGIONAL: cover every planned market with one broad make before adding depth.
  // This makes scarce hosted intake useful to the buyer instead of filling it with national comps.
  regional: for (const make of REGIONAL_MAKES) {
    for (const zip of autotempestRegionalZips()) {
      try {
        const complete = await harvestQuery(
          { make },
          zip,
          byId,
          1,
          REGIONAL_RADIUS,
          control,
        );
        if (!complete) break regional;
      } catch (e) {
        if (args.abortSignal?.aborted) throw e;
        console.warn(
          `[Autotempest] regional ${make}@${zip} failed:`,
          (e as Error).message,
        );
      }
    }
  }

  // Pass 2 — NATIONAL: fill remaining capacity with rotating make/model coverage. Rotation keeps
  // bounded runs broad even when the regional pass consumes most of the current source deadline.
  if (byId.size < control.maxResults) {
    for (const q of autotempestQueryOrder()) {
      try {
        const complete = await harvestQuery(
          q,
          nationalZip,
          byId,
          maxPagesPerQuery,
          13000,
          control,
        );
        if (!complete) break;
      } catch (e) {
        if (args.abortSignal?.aborted) throw e;
        console.warn(
          `[Autotempest] national ${q.make} ${q.model || ""} failed:`,
          (e as Error).message,
        );
      }
    }
  }

  const deals = Array.from(byId.values()).slice(0, control.maxResults);
  const withState = deals.filter((d) => d.location_state).length;
  console.log(
    `[Autotempest] Found ${deals.length} listings (${withState} with state)`,
  );
  return deals.length > 0 ? upsertDeals(deals) : 0;
}
