// lib/scrapers/sources/index.ts
// ─── Per-source scraper implementations ──────────────────────────────────────

import { createRobotsGate, policyBlockFor } from "../source-compliance";
import type { Deal } from "@/types";
import {
  fetchBrowser,
  fetchHtml,
  paginate,
  extractPrice,
  extractMileage,
  extractYear,
  normalizeUrl,
  type ScraperConfig,
} from "../engine";
import { upsertDeals } from "../pipeline";
import { CRAIGSLIST_SITES, US_STATES } from "@/lib/geo";
import { isValidVin, extractVin, normalizeVin } from "@/lib/vehicle/vin";
import { enrichPriority } from "@/lib/scrapers/enrich-priority";
import { loadProfitableMakes } from "@/lib/intelligence/profitable-segments";
import {
  CURATED_SITES,
  SITE_TYPE_DEFAULTS,
} from "@/lib/scrapers/curated-sites";
import { getScrapeRunScope } from "@/lib/scrapers/run-scope-context";
import { getSweepPlan, type SweepPlan } from "@/lib/scrapers/sweep-plan";
import pLimit from "p-limit";
import { arsenalCuratedSites } from "@/lib/scrapers/arsenal";
import { fetchPublicHtml } from "@/lib/net/fetch-public-html";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import {
  curatedSiteKey,
  loadCuratedRotation,
  planCuratedRotation,
  saveCuratedRotation,
} from "../curated-rotation";
import { createPoliteHtmlFetcher } from "../polite-html";

// ── Detail-page enrichment ───────────────────────────────────────────────────
// Listing CARDS lack VIN / true mileage / title status — those live on each detail page.
// We fetch a bounded number of detail pages (static HTML, $0) to pull the real data the
// valuation/dedupe/recall engines need. Tunable: CL_ENRICH (default on), CL_ENRICH_MAX,
// CL_ENRICH_CONCURRENCY.

// Craigslist "title status" → listing_condition enum.
function mapCraigslistTitle(status?: string): string | undefined {
  const s = (status || "").toLowerCase();
  if (!s) return undefined;
  if (s.includes("clean")) return "clean_title";
  if (s.includes("salvage")) return "salvage_title";
  if (s.includes("rebuilt") || s.includes("rebuild")) return "rebuilt_title";
  if (s.includes("parts")) return "parts_only";
  return undefined; // lien/missing/etc → leave as-is
}

// Craigslist (and many dealer) gallery cards don't expose odometer structurally, but the TITLE almost
// always carries it ("2015 F-150 90k miles", "Accord 90,000 mi"). Pull it from the title so the
// majority of CL inventory gets mileage WITHOUT a detail-page fetch — which lights up mileage-aware
// valuation + the price-vs-mileage visualizer for our biggest source. Prices ($15k) are stripped
// first so they can't be misread as miles.
export function mileageFromTitle(title?: string | null): number | undefined {
  if (!title) return undefined;
  const t = title.toLowerCase().replace(/\$\s?\d[\d,.]*\s*k?/g, " ");
  // "90k", "90 k", "90k miles", "90k mi"
  let m = t.match(/\b(\d{1,3})\s*k(?:\s*(?:miles|mile|mi))?\b/);
  if (m) {
    const v = parseInt(m[1], 10) * 1000;
    if (v >= 1000 && v <= 400000) return v;
  }
  // "90,000 miles", "90000 mi", "143,250 miles"
  m = t.match(
    /\b(\d{1,3}(?:,\d{3})|\d{4,6})\s*(?:miles|mile|mi|odometer|odo)\b/,
  );
  if (m) {
    const v = parseInt(m[1].replace(/,/g, ""), 10);
    if (v >= 1000 && v <= 400000) return v;
  }
  return undefined;
}

export function mileageFromDealerText(
  text?: string | null,
): number | undefined {
  if (!text) return undefined;
  const normalized = textClean(text).toLowerCase();
  if (
    /\b(unknown|exempt|not actual|na|n\/a|tm[au]?|true mileage unknown)\b/.test(
      normalized,
    )
  ) {
    return undefined;
  }
  const explicit = extractMileage(normalized);
  if (explicit && explicit >= 1000 && explicit <= 400000) return explicit;
  const match = normalized.match(
    /\b(\d{1,3}(?:,\d{3})|\d{4,6})\s*(?:actual|act|odo|odometer)\b|\b(\d{1,3},\d{3})\b/,
  );
  if (!match) return undefined;
  const value = Number((match[1] || match[2]).replace(/,/g, ""));
  return value >= 1000 && value <= 400000 ? value : undefined;
}

export async function enrichCraigslistDetail(
  url: string,
): Promise<Partial<Deal>> {
  try {
    // SSRF: never axios.get(url) directly — same public-URL gate as save-from-url /
    // image-proxy. fetchPublicHtml asserts each hop + pins sockets to public IPs.
    const fetched = await fetchPublicHtml(url);
    if (!fetched) return {};
    const cheerio = await import("cheerio");
    const $ = cheerio.load(fetched.html);
    const out: Partial<Deal> = {};

    const attr = (cls: string) =>
      $(`.attr.${cls} .valu, .attr.${cls} a`).first().text().trim();

    // VIN — dedicated attr (validated), else scan the attribute group AND the posting body for a
    // checksum-valid VIN. Check-digit validation rejects the random 17-char strings that the old
    // length-only test let through.
    const vinAttr = attr("auto_vin");
    const vin =
      (isValidVin(vinAttr) && normalizeVin(vinAttr)) ||
      extractVin($(".attrgroup").text()) ||
      extractVin($("#postingbody").text());
    if (vin) out.vin = vin;

    // Odometer / true mileage.
    const odo = attr("auto_miles") || attr("odometer");
    const miles = parseInt(odo.replace(/[^0-9]/g, ""));
    if (miles > 0 && miles < 400000) out.mileage = miles;

    // Title status → real condition.
    const cond = mapCraigslistTitle(attr("auto_title_status"));
    if (cond) out.condition = cond as any;

    // Better/more images from the detail gallery.
    const imgs = $('.gallery img, .slide img, img[src*="images.craigslist"]')
      .map((_, e) => $(e).attr("src"))
      .get()
      .filter(Boolean) as string[];
    if (imgs.length) out.images = Array.from(new Set(imgs)).slice(0, 12);

    return out;
  } catch (error) {
    if (error instanceof UrlNotAllowedError) throw error;
    return {};
  }
}

async function enrichDeals(deals: Partial<Deal>[]): Promise<void> {
  if (process.env.CL_ENRICH === "false") return;
  const max = parseInt(process.env.CL_ENRICH_MAX || "60");
  const concurrency = parseInt(process.env.CL_ENRICH_CONCURRENCY || "4");
  // Enrich listings that still lack a VIN, highest deal-potential first, up to the cap — so the
  // bounded detail-fetch budget lands on the likely-GO deals (auto-tuned, not first-come). The
  // ranking is also outcome-aware: makes the dealer has profited on get boosted (closed loop).
  const profitableMakes = await loadProfitableMakes();
  const targets = deals
    .filter((d) => d.source_url && (!d.vin || d.vin.length !== 17))
    .sort(
      (a, b) =>
        enrichPriority(b, profitableMakes) - enrichPriority(a, profitableMakes),
    )
    .slice(0, max);
  if (!targets.length) return;
  const limit = pLimit(concurrency);
  let enriched = 0;
  await Promise.all(
    targets.map((d) =>
      limit(async () => {
        try {
          const extra = await enrichCraigslistDetail(d.source_url as string);
          if (Object.keys(extra).length) {
            Object.assign(d, extra);
            enriched++;
          }
        } catch (error) {
          if (!(error instanceof UrlNotAllowedError)) throw error;
        }
      }),
    ),
  );
  console.log(
    `[Craigslist] Enriched ${enriched}/${targets.length} detail pages (VIN/mileage/title)`,
  );
}

// ════════════════════════════════════════════════════════════
//  COPART — salvage auction (open JSON API; see ./copart.ts)
// ════════════════════════════════════════════════════════════
export { scrapeCopart, parseCopartLots } from "./copart";

// ════════════════════════════════════════════════════════════
//  CRAIGSLIST — covers all US cities
// ════════════════════════════════════════════════════════════
// Nationwide Craigslist coverage. Defaults to all 50-state metro subdomains (lib/geo.ts).
// Override with CL_CITIES env (comma-separated subdomains); cap per-run with CL_MAX_CITIES.
const CL_SITE_STATE = new Map(CRAIGSLIST_SITES.map((s) => [s.site, s.state]));
const CL_CITIES: string[] = (() => {
  const fromEnv = process.env.CL_CITIES?.split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  let all = fromEnv?.length ? fromEnv : CRAIGSLIST_SITES.map((s) => s.site);
  // Rotating shards for frequent near-real-time runs: CL_SHARDS=N total, CL_SHARD=k this run.
  const shards = parseInt(process.env.CL_SHARDS || "0");
  const shard = parseInt(process.env.CL_SHARD || "0");
  if (shards > 1)
    all = all.filter(
      (_, i) => i % shards === ((shard % shards) + shards) % shards,
    );
  const cap = parseInt(process.env.CL_MAX_CITIES || "0");
  return cap > 0 ? all.slice(0, cap) : all;
})();

/**
 * Craigslist sites for this run. CL_CITIES (operator override) wins. In a Docker sweep, every
 * site in the planned states, so each run covers a rotating slice of all 50 states. Otherwise
 * the full (optionally sharded/capped) list.
 */
export function craigslistSitesForRun(
  plan: SweepPlan | undefined = getSweepPlan(),
  envCities: string | undefined = process.env.CL_CITIES,
): string[] {
  if (envCities?.trim()) return CL_CITIES;
  if (plan?.states?.length) {
    const wanted = new Set(plan.states.map((s) => s.toUpperCase()));
    const sites = CRAIGSLIST_SITES.filter((s) => wanted.has(s.state)).map(
      (s) => s.site,
    );
    if (sites.length) return sites;
  }
  return CL_CITIES;
}

/**
 * Craigslist search URL for one site, channel, and page. `query` is a full-text filter, so the old
 * default "cars+trucks" only matched posts containing those words: 21 of 355 Dallas owner listings
 * on 2026-10-04. No query returns the whole category.
 */
export function craigslistSearchUrl(
  city: string,
  channelPath: string,
  page: number,
  query = "",
  minPrice = 500,
  maxPrice = 35000,
): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  params.set("min_price", String(minPrice));
  params.set("max_price", String(maxPrice));
  if (page > 1) params.set("s", String((page - 1) * 120));
  return `https://${city}.craigslist.org/search/${channelPath}?${params.toString()}`;
}

export const CL_CONFIG: ScraperConfig = {
  name: "Craigslist",
  baseUrl: "https://craigslist.org",
  renderMode: "static", // CL is static HTML — fast!
  requestDelay: 1500,
  concurrency: 5,
  useProxies: false, // CL rarely blocks
  stealth: false,
  maxPages: 10,
};

// Craigslist channels: by-owner = private/wholesale supply, by-dealer = retail comps.
// Scanning both gives a real $0 retail-vs-private spread (the arbitrage signal).
const CL_CHANNELS: { path: string; source: string }[] = [
  { path: "cto", source: "craigslist" }, // cars+trucks by owner
  { path: "ctd", source: "craigslist_dealer" }, // cars+trucks by dealer (retail)
];

/** Parse one Craigslist search page (current static layout and the legacy result-row). */
export async function parseCraigslistResults(
  $raw: unknown,
  city: string,
  channel: { path: string; source: string },
): Promise<{ items: Partial<Deal>[]; hasMore: boolean }> {
  const cheerio = await import("cheerio");
  const $ =
    typeof $raw === "string"
      ? cheerio.load($raw)
      : ($raw as ReturnType<typeof cheerio.load>);
  const items: Partial<Deal>[] = [];

  $(".cl-static-search-result, .cl-search-result, li.result-row").each(
    (_, el) => {
      const row = $(el);
      const title = row
        .find(".title, .title-anchor, a.result-title")
        .text()
        .trim();
      const priceText = row.find(".price").text().trim();
      const url = row.find("a").attr("href");
      const hood = row
        .find(".location, .hood")
        .text()
        .replace(/[()]/g, "")
        .trim();
      const imgSrc = row.find("img").attr("src");

      if (!title) return;

      items.push({
        source: channel.source,
        source_deal_id: url?.split("/").pop()?.replace(".html", "") || "",
        source_url: url
          ? normalizeUrl(url, `https://${city}.craigslist.org`)
          : "",
        title,
        year: extractYear(title),
        make: title.split(" ").slice(1, 2).join("") || "",
        model: title.split(" ").slice(2, 4).join(" ") || "",
        ask_price: extractPrice(priceText) || 0,
        mileage: mileageFromTitle(title),
        condition: "run_drive",
        location_city: hood || city,
        location_state: CL_SITE_STATE.get(city),
        seller_type:
          channel.source === "craigslist_dealer" ? "dealer" : "private",
        images: imgSrc ? [imgSrc] : [],
      });
    },
  );

  const totalText = $(".totalcount").text();
  const total = parseInt(totalText) || 0;
  const offset = parseInt(
    new URL(
      $('link[rel="next"]').attr("href") || "",
      "https://craigslist.org",
    ).searchParams.get("s") || "0",
  );
  return { items, hasMore: offset < total && items.length > 0 };
}

export async function scrapeCraigslist(
  query = process.env.CL_QUERY || "",
  minPrice = 500,
  maxPrice = 35000,
) {
  const plan = getSweepPlan();
  const cities = craigslistSitesForRun(plan);
  // A sweep covers many sites. Keep each one shallow (CL_SWEEP_PAGES, default 2 x 120 rows).
  const config: ScraperConfig = plan
    ? {
        ...CL_CONFIG,
        maxPages: Math.max(1, parseInt(process.env.CL_SWEEP_PAGES || "2") || 2),
      }
    : CL_CONFIG;
  console.log(
    `[Craigslist] Scanning ${cities.length} cities × ${CL_CHANNELS.length} channels...`,
  );
  const allDeals: Partial<Deal>[] = [];

  for (const city of cities) {
    for (const channel of CL_CHANNELS) {
      const gen = paginate<Partial<Deal>>(
        config,
        (page) =>
          craigslistSearchUrl(
            city,
            channel.path,
            page,
            query,
            minPrice,
            maxPrice,
          ),
        ($raw) => parseCraigslistResults($raw, city, channel),
      );

      for await (const batch of gen) allDeals.push(...batch);
    }
  }

  console.log(`[Craigslist] Found ${allDeals.length} deals`);
  // Pull VIN / true mileage / title status from detail pages (bounded, $0).
  await enrichDeals(allDeals);
  await upsertDeals(allDeals);
  return allDeals.length;
}

// ════════════════════════════════════════════════════════════
//  INDEPENDENT DEALER CRAWLER
//  The core differentiator — crawls sites like:
//  AE of Miami 74 Auto, 111 Used Cars, STL Auction Pipeline, etc.
// ════════════════════════════════════════════════════════════
export const INDI_CONFIG: ScraperConfig = {
  name: "IndependentDealers",
  baseUrl: "", // set per-dealer
  renderMode: "browser",
  requestDelay: 2000,
  concurrency: 3,
  useProxies: true,
  stealth: true,
  maxPages: 20,
};

// Dealer site profiles — patterns we know how to parse
interface DealerProfile {
  dealerId: string;
  name: string;
  city: string;
  state: string;
  inventoryUrl: string;
  // CSS selectors for each data point
  selectors: {
    dealCard: string;
    title: string;
    price: string;
    mileage?: string;
    image?: string;
    link?: string;
    condition?: string;
    year?: string;
  };
  // Some dealers paginate via URL param
  pagination?: {
    param: string; // e.g. 'page' or 'start'
    style: "page" | "offset";
    perPage: number;
  };
  // JS-rendered sites need browser; static can use fetch
  renderMode?: "static" | "browser";
  // Per-site defaults injected onto every scraped car when the listing itself doesn't say. A salvage
  // yard's stock is salvage-title; a rebuilder's is rebuilt/repairable. These land on condition /
  // damage_type, which dealLane() already reads — so curated salvage cars color correctly (red/orange)
  // instead of falling through to the "private" lane. See SITE_TYPE_DEFAULTS.
  conditionDefault?: string;
  damageDefault?: string;
  sellerDefault?: string;
}

export const DEALER_PROFILES: DealerProfile[] = [
  // ── DealerSocket / VinSolutions powered dealers (very common)
  {
    dealerId: "generic-dealersocket",
    name: "DealerSocket Template",
    city: "",
    state: "",
    inventoryUrl: "/inventory",
    renderMode: "browser",
    selectors: {
      dealCard: '.vehicle-card, .inventory-deal, [class*="VehicleCard"]',
      title: '.vehicle-title, h2.title, [class*="vehicleTitle"]',
      price: '.price, [class*="Price"], .vehicle-price',
      mileage: '.mileage, [class*="mileage"]',
      image: 'img.vehicle-image, [class*="vehicleImage"] img',
      link: 'a[href*="/inventory/"]',
    },
    pagination: { param: "page", style: "page", perPage: 24 },
  },
  // ── WordPress + WP-Inventory dealers (many small lots use this)
  {
    dealerId: "generic-wp",
    name: "WordPress Auto Dealer",
    city: "",
    state: "",
    inventoryUrl: "/inventory",
    renderMode: "static",
    selectors: {
      dealCard: ".vehicle_deal, .car-deal, article.type-auto_deals",
      title: "h2.wpl-deal-title, .vehicle-name, h3.entry-title",
      price: ".wpl-price, .price, .vehicle-price",
      mileage: ".wpl-mileage, .mileage",
      image: ".vehicle-image img, .deal-image img",
      link: "a.deal-link, .vehicle-title a",
    },
    pagination: { param: "paged", style: "page", perPage: 12 },
  },
];

// Read an explicit title brand off the listing text. Returns undefined when the listing says nothing
// (most dealer cards), so the caller falls back to the site's type default. Unlike autotempest's
// titleToCondition this never guesses "clean" — silence means "use the site default", not "clean".
function conditionFromTitle(title?: string): string | undefined {
  const x = (title || "").toLowerCase();
  // "Prior salvage" = was salvaged, now retitled rebuilt/reconstructed → rebuilt, NOT active salvage.
  if (/prior[\s-]?salvage|reconstruct/.test(x)) return "rebuilt_title";
  if (/\bsalvage\b/.test(x)) return "salvage_title";
  if (/\brebuilt\b/.test(x)) return "rebuilt_title";
  if (/\b(repairable|rebuildable)\b/.test(x)) return "repairable";
  if (/\bflood\b/.test(x)) return "flood";
  if (/\b(parts only|parts car|non[-\s]?run|wrecked|junk)\b/.test(x))
    return "salvage_title";
  // "Clear"/"Clean" is how salvage sites (e.g. damage.com) badge a clean-title car.
  if (/\b(clean|clear)\b/.test(x)) return "clean_title";
  return undefined;
}

export async function scrapeIndependentDealer(
  profile: DealerProfile,
  baseUrl: string,
  abortSignal?: AbortSignal,
  fetchPageHtml?: (url: string) => Promise<string>,
): Promise<number> {
  console.log(`[IndiDealer] Scraping ${profile.name} at ${baseUrl}`);
  const allDeals: Partial<Deal>[] = [];
  const config = {
    ...INDI_CONFIG,
    baseUrl,
    renderMode: profile.renderMode || "browser",
    abortSignal,
    fetchPageHtml,
  };
  const sel = profile.selectors;
  const seenListings = new Set<string>();

  const gen = paginate<Partial<Deal>>(
    config,
    (page) => {
      const url = new URL(profile.inventoryUrl, baseUrl);
      if (profile.pagination) {
        const offset =
          profile.pagination.style === "offset"
            ? (page - 1) * profile.pagination.perPage
            : page;
        url.searchParams.set(profile.pagination.param, String(offset));
      }
      return url.toString();
    },
    async (rawHtml) => {
      const cheerio = await import("cheerio");
      const $ = cheerio.load(
        typeof rawHtml === "string" ? rawHtml : rawHtml.html(),
      );
      const items: Partial<Deal>[] = [];

      $(sel.dealCard).each((_, el) => {
        const card = $(el);
        const title = card.find(sel.title).first().text().trim();
        const priceText = card.find(sel.price).first().text().trim();
        const mileText = sel.mileage
          ? card.find(sel.mileage).first().text().trim()
          : "";
        const imgSrc = sel.image
          ? card.find(sel.image).first().attr("src")
          : undefined;
        const href = sel.link
          ? card.find(sel.link).first().attr("href")
          : undefined;

        if (!title || title.length < 5) return;

        const price = extractPrice(priceText);
        if (!price || price < 100) return; // skip contact-for-price

        // Require a stable id from the listing URL so upsert dedupe works.
        const dealId = href?.split("/").filter(Boolean).pop();
        if (!dealId) return;

        items.push({
          source: "independent_dealer",
          source_deal_id: dealId,
          source_url: href ? normalizeUrl(href, baseUrl) : baseUrl,
          title,
          year: extractYear(title),
          make: title.split(" ").filter((w) => w.match(/[A-Z][a-z]+/))[0] || "",
          model: title.split(" ").slice(2, 4).join(" ") || "",
          ask_price: price,
          vin: extractVin(`${card.text()} ${href || ""}`) ?? undefined,
          mileage: extractMileage(mileText) || mileageFromTitle(title),
          // Prefer what the listing text says; else the site's type default (salvage yard → salvage,
          // rebuilder → rebuilt). Drives the correct lane/color downstream via dealLane().
          condition:
            conditionFromTitle(title) ??
            profile.conditionDefault ??
            "run_drive",
          damage_type: profile.damageDefault,
          seller_type: profile.sellerDefault as Deal["seller_type"],
          location_city: profile.city,
          location_state: profile.state,
          images: imgSrc ? [normalizeUrl(imgSrc, baseUrl)] : [],
        });
      });

      // Structured inventory can include cars missed by a partial CSS match. Keep the CSS row when
      // both describe the same listing, and only supplement it with priced, vehicle-shaped rows.
      const structuredHtml =
        typeof rawHtml === "string" ? rawHtml : rawHtml.html();
      let hasStructuredInventory = false;
      if (structuredHtml.length > 1500) {
        const { genericExtract } = await import("../generic-extractor");
        const structured = genericExtract(structuredHtml, "independent_dealer");
        hasStructuredInventory = structured.length > 0;
        const listingUrls = new Set(items.map((item) => item.source_url));
        const listingVins = new Set(
          items.map((item) => item.vin).filter(Boolean),
        );
        let supplemented = 0;
        for (const g of structured) {
          if ((!g.make && !g.title) || !g.ask_price || g.ask_price < 100)
            continue;
          const sourceUrl = g.source_url
            ? normalizeUrl(g.source_url, baseUrl)
            : undefined;
          // Inventory/account URLs are not a stable identity for a separate vehicle.
          if (
            !sourceUrl ||
            sourceUrl === baseUrl ||
            sourceUrl === normalizeUrl(profile.inventoryUrl, baseUrl)
          )
            continue;
          if (listingUrls.has(sourceUrl) || (g.vin && listingVins.has(g.vin)))
            continue;
          listingUrls.add(sourceUrl);
          if (g.vin) listingVins.add(g.vin);
          items.push({
            source: "independent_dealer",
            source_deal_id:
              (g.source_url && g.source_url !== baseUrl
                ? g.source_url.split("/").filter(Boolean).pop()
                : "") ||
              `${profile.dealerId}-${[g.year, g.make, g.model, g.ask_price, g.mileage].filter(Boolean).join("-")}`,
            source_url: sourceUrl,
            title:
              [g.year, g.make, g.model].filter(Boolean).join(" ") ||
              g.title ||
              "",
            year: g.year,
            make: g.make || "",
            model: g.model || "",
            ask_price: g.ask_price || 0,
            mileage: g.mileage,
            vin: g.vin,
            condition:
              conditionFromTitle(g.title || "") ||
              profile.conditionDefault ||
              "run_drive",
            damage_type: profile.damageDefault,
            seller_type: profile.sellerDefault as Deal["seller_type"],
            location_city: profile.city,
            location_state: profile.state,
            images: g.images || [],
          });
          supplemented += 1;
        }
        if (supplemented)
          console.log(
            `[IndiDealer] ${profile.name}: genericExtract supplemented ${supplemented} priced listings (free)`,
          );
      }

      // AI rescue: generic selectors AND the free structured rescue both matched nothing. When that
      // happens (and the page genuinely has content), let the LLM extract the listings. Cost-gated —
      // only fires on a double miss, only when a provider key + AI_SCRAPE_EXTRACT are configured.
      if (
        items.length === 0 &&
        !hasStructuredInventory &&
        typeof rawHtml === "string" &&
        rawHtml.length > 1500
      ) {
        const { aiExtractVehicles, aiExtractEnabled } =
          await import("../tools/ai-extract");
        if (aiExtractEnabled()) {
          const extracted = await aiExtractVehicles(rawHtml, baseUrl);
          for (const v of extracted) {
            if (!v.price || v.price < 100) continue;
            if (!v.make && !v.title) continue;
            items.push({
              source: "independent_dealer",
              // A unique id per car. Many bespoke salvage sites give the AI no per-listing URL (the
              // url is the homepage), so a url-derived id collides across every car — fall back to a
              // content key (year/make/model/price/mileage), NOT the title-brand word ("Salvage").
              source_deal_id:
                (v.url && v.url !== baseUrl
                  ? v.url.split("/").filter(Boolean).pop()
                  : "") ||
                `${profile.dealerId}-${[v.year, v.make, v.model, v.price, v.mileage].filter(Boolean).join("-")}`,
              source_url: v.url ? normalizeUrl(v.url, baseUrl) : baseUrl,
              // Real vehicle identity first; v.title is often just the title-brand badge ("Salvage"),
              // which we already fold into condition via conditionFromTitle below.
              title:
                [v.year, v.make, v.model].filter(Boolean).join(" ") ||
                v.title ||
                "",
              year: v.year,
              make: v.make || "",
              model: v.model || "",
              ask_price: v.price,
              mileage: v.mileage,
              vin: v.vin,
              // Title brand first (damage.com etc. put "Salvage"/"Clear"/"Rebuilt" in the heading the
              // AI returns as title), then the site's type default; the AI's free-text condition is
              // often just a run-status ("Run & Drive") so it's the last hint (pipeline normalizes it).
              condition:
                conditionFromTitle(v.title) ||
                profile.conditionDefault ||
                (v as any).condition ||
                "run_drive",
              damage_type: profile.damageDefault,
              seller_type: profile.sellerDefault as Deal["seller_type"],
              location_city: v.location_city || profile.city,
              location_state: v.location_state || profile.state,
              images: [],
            });
          }
          if (items.length)
            console.log(
              `[IndiDealer] ${profile.name}: AI-extracted ${items.length} (selector miss)`,
            );
        }
      }

      // Detect "no more results" — check for next page link or empty results
      const hasNext =
        $(
          'a[rel="next"], .pagination .next:not(.disabled), [aria-label="Next"]',
        ).length > 0;
      const fresh = items.filter((item) => {
        const key = String(item.source_deal_id || item.source_url);
        if (seenListings.has(key)) return false;
        seenListings.add(key);
        return true;
      });
      return { items: fresh, hasMore: hasNext && fresh.length > 0 };
    },
  );

  for await (const batch of gen) allDeals.push(...batch);

  console.log(`[IndiDealer] ${profile.name}: Found ${allDeals.length} deals`);
  // dealer_id is a UUID FK; these auto-discovered sites have no dealers-table row, so leave it null.
  // A hostname slug ("auto-www.damage.com") fails the uuid type and silently drops every row.
  abortSignal?.throwIfAborted();
  const saved = await upsertDeals(allDeals);
  console.log(
    `[IndiDealer] ${profile.name}: ${saved}/${allDeals.length} rows accepted`,
  );
  return saved;
}

// ── Generic "discover and crawl any dealer site" ─────────────────────────────
// Given just a website URL, this auto-detects the inventory pattern
export async function autoDiscoverAndCrawl(
  dealerWebsite: string,
  hint?: {
    name?: string;
    city?: string;
    state?: string;
    conditionDefault?: string;
    damageDefault?: string;
    sellerDefault?: string;
    inventoryUrl?: string; // exact inventory page — skip auto-discovery when provided
  },
  abortSignal?: AbortSignal,
  fetchPageHtml?: (url: string) => Promise<string>,
): Promise<number> {
  abortSignal?.throwIfAborted();
  console.log(`[AutoDiscover] Analyzing ${dealerWebsite}`);

  let html: string;
  if (fetchPageHtml) {
    html = await fetchPageHtml(
      hint?.inventoryUrl
        ? normalizeUrl(hint.inventoryUrl, dealerWebsite)
        : dealerWebsite,
    );
  } else {
    const fetched = await fetchBrowser(dealerWebsite, {
      ...INDI_CONFIG,
      baseUrl: dealerWebsite,
    });
    try {
      html = fetched.html;
    } finally {
      await fetched.close();
    }
  }
  abortSignal?.throwIfAborted();

  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  // Find inventory link. Two-pass + guarded: a link whose HREF points at an inventory path is far more
  // reliable than one matched only on link text, so we prefer href matches and fall back to text. We
  // skip non-navigational hrefs (javascript:void(0), #, mailto:, tel:) — those were silently becoming
  // the "inventory URL" and aborting the whole crawl (e.g. damage.com's JS nav toggle).
  const navigational = (href: string) =>
    href &&
    !/^(javascript:|#|mailto:|tel:|data:)/i.test(href.trim()) &&
    !/saved.?vehicles|compare|wishlist|favorites|my.?garage/i.test(href) &&
    href.trim() !== "/";
  const INV_PATH =
    /inventory|vehicles|\/used|for-sale|listings|stock|showroom/i;
  const INV_TEXT = /inventory|vehicles|stock|cars|used|available|repairable/i;

  // Explicit override (from the curated registry) wins — for sites whose inventory lives at a non-standard
  // URL the auto-discovery can't find (e.g. /vehicles.php on a subdomain).
  let inventoryUrl = hint?.inventoryUrl
    ? normalizeUrl(hint.inventoryUrl, dealerWebsite)
    : "";
  let textFallback = "";
  if (!inventoryUrl) {
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (!navigational(href)) return; // skip JS/anchor/mailto links
      const text = $(el).text().toLowerCase();
      if (INV_PATH.test(href)) {
        inventoryUrl = normalizeUrl(href, dealerWebsite);
        return false; // strong match — stop
      }
      if (!textFallback && INV_TEXT.test(text)) {
        textFallback = normalizeUrl(href, dealerWebsite);
      }
    });
    if (!inventoryUrl) inventoryUrl = textFallback;
  }

  if (!inventoryUrl) {
    console.warn(`[AutoDiscover] No inventory page found at ${dealerWebsite}`);
    return 0;
  }

  // Try to match a known profile pattern
  const matchedProfile = DEALER_PROFILES.find((p) =>
    p.selectors.dealCard.split(",").some((sel) => $(sel.trim()).length > 0),
  );

  const base: DealerProfile = matchedProfile || {
    dealerId: `auto-${new URL(dealerWebsite).hostname}`,
    name: hint?.name || $("title").text() || dealerWebsite,
    city: hint?.city || "",
    state: hint?.state || "",
    inventoryUrl,
    renderMode: "browser",
    selectors: {
      // Best-effort generic selectors
      dealCard: [
        '[class*="vehicle"], [class*="deal"], [class*="inventory"], [class*="car-card"]',
        "article, .grid-item, .card",
      ].join(","),
      title: 'h1, h2, h3, [class*="title"], [class*="name"]',
      price: '[class*="price"], [class*="Price"]',
      mileage: '[class*="mile"], [class*="odometer"]',
      image: "img",
      link: "a[href]",
    },
    pagination: { param: "page", style: "page", perPage: 24 },
  };

  // Carry the caller's hints (site name/location + the type-driven condition/damage defaults) onto the
  // profile even when we reuse a known platform template, so curated salvage cars get the right lane.
  const profile: DealerProfile = {
    ...base,
    name: hint?.name || base.name,
    city: hint?.city || base.city,
    state: hint?.state || base.state,
    conditionDefault: hint?.conditionDefault ?? base.conditionDefault,
    damageDefault: hint?.damageDefault ?? base.damageDefault,
    sellerDefault: hint?.sellerDefault ?? base.sellerDefault,
  };

  return scrapeIndependentDealer(
    profile,
    dealerWebsite,
    abortSignal,
    fetchPageHtml,
  );
}

// ════════════════════════════════════════════════════════════
//  CURATED SITES — the dealer-to-dealer salvage-rebuilder network nobody aggregates
// ════════════════════════════════════════════════════════════
// WE maintain this master list (no dealer submission needed — we find them all). Each entry is just a
// homepage URL; autoDiscoverAndCrawl finds the inventory page and ingests it via a platform template
// or AI-rescue, so ADDING A SITE = ADDING A LINE. These are salvage yards / rebuilders reselling
// rebuildable cars — the key moat layer. State hints land them on the 50-state map. Extend freely.
// How each kind of site is read. The `type` makes the network easily distinguishable on the map and in
// the discover rails; it also picks the condition/damage default injected onto every car from that site
// (via SITE_TYPE_DEFAULTS) so dealLane() colors them correctly — salvage yards red, rebuilders orange.

// The curated-site registry lives in a light data module (imported at the top for internal use); re-export
// so existing importers keep resolving these from "@/lib/scrapers/sources".
export {
  CURATED_SITES,
  SITE_TYPE_DEFAULTS,
  SITE_TYPE_META,
  type CuratedSite,
  type CuratedSiteType,
} from "@/lib/scrapers/curated-sites";

/** Crawl the curated salvage/dealer network — bounded + polite. Each site ingested from its URL.
 *  Per-site yield is logged so silently-dead/walled sites are visible (not assumed-covered); dead
 *  sites produce 0 cars and are pruned by the normal stale/dead retention. */
export async function scrapeCuratedSites(
  maxSites = CURATED_SITES.length,
  execution?: { abortSignal?: AbortSignal; deadlineAt?: number },
): Promise<number> {
  const scope = getScrapeRunScope();
  const requestedDealers = new Set(scope?.dealerSourceIds || []);
  const dealerNeedles: Record<string, string[]> = {
    "ae-of-miami": ["aeofmiami.com"],
    "damage-com": ["damage.com"],
    "dg-auto": ["dgautollc.com"],
    recar: ["recar.com"],
    "stjames-auto": ["stjamesautoparts.com", "stjamesauto.com"],
    "cas-miami": ["casmiami.com"],
    salvagezone: ["salvagezone.com"],
    "rebuilt-auto": ["rebuiltauto.com"],
    "alpine-auto": ["alpinerebuildablecars.com", "alpineautogallery.com"],
    "replica-auto": ["replicaautosales.net", "replicaauto.com"],
  };
  const matchesRequestedDealer = (site: (typeof CURATED_SITES)[number]) => {
    if (!requestedDealers.size) return true;
    const haystack = `${site.url} ${site.inventoryUrl || ""}`.toLowerCase();
    return Array.from(requestedDealers).some((id) =>
      (dealerNeedles[id] || [id]).some((needle) =>
        haystack.includes(needle.toLowerCase()),
      ),
    );
  };
  // Terms/challenge blocks are skipped before any request; see lib/scrapers/source-compliance.ts.
  // Operator-enabled arsenal candidates (ARSENAL_ENABLE) ride the same policy + robots gates.
  const candidates = [...CURATED_SITES, ...arsenalCuratedSites()].filter(
    matchesRequestedDealer,
  );
  const blocked = candidates.filter((site) => policyBlockFor(site.url));
  if (blocked.length)
    console.log(
      `[CuratedSites] skipping ${blocked.length} by site policy: ${blocked
        .map((site) => `${site.name} (${policyBlockFor(site.url)?.kind})`)
        .join(", ")}`,
    );
  // Least-recently-attempted dealers lead; demand / want-hit gaps break ties.
  const plannedStates = getSweepPlan()?.states || [];
  const rotation = await loadCuratedRotation();
  const sites = planCuratedRotation(
    candidates.filter((site) => !policyBlockFor(site.url)),
    rotation,
    plannedStates,
  ).slice(0, maxSites);
  const robotsAllowed = createRobotsGate();
  const fetchPageHtml = createPoliteHtmlFetcher();
  console.log(
    `[CuratedSites] Crawling ${sites.length} curated salvage/dealer sites${
      requestedDealers.size
        ? ` for ${Array.from(requestedDealers).join(", ")}`
        : ""
    }...`,
  );
  let total = 0;
  const yields: { name: string; state?: string; type: string; n: number }[] =
    [];
  // Inside a Zeus sweep the curated crawl is one idle tick; cap it so buyer jobs never wait behind
  // a 180-site walk. Persistent attempt history rotates deferred dealers into later runs.
  // Outside a sweep (CI, smoke) there is no cap unless an executor deadline was supplied.
  const budgetMs = plannedStates.length
    ? Math.max(
        60_000,
        Number(process.env.CURATED_SWEEP_BUDGET_MS) || 4 * 60_000,
      )
    : Infinity;
  const startedAt = Date.now();
  // Reserve a minute for the last site's browser work before the executor deadline.
  const deadlineAt = Math.min(
    startedAt + budgetMs,
    (execution?.deadlineAt ?? Infinity) - 60_000,
  );
  let skippedForBudget = 0;
  let attempted = 0;
  for (const site of sites) {
    execution?.abortSignal?.throwIfAborted();
    if (Date.now() >= deadlineAt) {
      skippedForBudget += 1;
      continue;
    }
    const d = SITE_TYPE_DEFAULTS[site.type];
    attempted += 1;
    rotation.lastAttempted[curatedSiteKey(site)] = Date.now();
    // Persist before browser work so a killed or timed-out dealer does not monopolize restarts.
    try {
      await saveCuratedRotation(rotation);
    } catch (error) {
      console.warn(
        "[CuratedSites] rotation write failed:",
        (error as Error).message,
      );
    }
    try {
      const cdgDealer = cdgDealerForSite(site.url);
      const firstPages = [
        site.url,
        site.inventoryUrl
          ? new URL(site.inventoryUrl, site.url).toString()
          : cdgDealer?.inventoryUrl,
      ].filter(Boolean) as string[];
      const disallowed = [];
      for (const page of firstPages)
        if (!(await robotsAllowed(page))) disallowed.push(page);
      if (disallowed.length) {
        console.log(
          `[CuratedSites] ${site.name}: robots.txt disallows ${disallowed.join(", ")} (skipped)`,
        );
        yields.push({
          name: site.name,
          state: site.state,
          type: site.type,
          n: 0,
        });
        continue;
      }
      const n = site.url.toLowerCase().includes("aeofmiami.com")
        ? await scrapeAeOfMiami(scope)
        : cdgDealer
          ? await scrapeCdgDealer(cdgDealer)
          : await autoDiscoverAndCrawl(
              site.url,
              {
                name: site.name,
                city: site.city,
                state: site.state,
                conditionDefault: d.condition,
                damageDefault: d.damage_type,
                sellerDefault: d.seller_type,
                inventoryUrl: site.inventoryUrl,
              },
              execution?.abortSignal,
              fetchPageHtml,
            );
      execution?.abortSignal?.throwIfAborted();
      console.log(
        `[CuratedSites] ${site.name} (${site.type}${site.state ? `/${site.state}` : ""}): ${n} listings`,
      );
      yields.push({ name: site.name, state: site.state, type: site.type, n });
      total += n;
    } catch (e) {
      execution?.abortSignal?.throwIfAborted();
      console.warn(`[CuratedSites] ${site.name} failed:`, (e as Error).message);
      yields.push({
        name: site.name,
        state: site.state,
        type: site.type,
        n: 0,
      });
    }
    await new Promise((r) => setTimeout(r, 2000)); // be polite between sites
  }
  // Coverage summary: how many sites yielded, and how many distinct states are now covered.
  const live = yields.filter((y) => y.n > 0);
  const states = new Set(live.map((y) => y.state).filter(Boolean));
  const dead = yields.filter((y) => y.n === 0).map((y) => y.name);
  console.log(
    `[CuratedSites] ${total} listings · ${live.length}/${attempted} attempted sites yielded · ${sites.length} eligible in this run · ${states.size} known dealer states yielded`,
  );
  if (dead.length)
    console.log(`[CuratedSites] no yield (check/prune): ${dead.join(", ")}`);
  if (skippedForBudget)
    console.log(
      `[CuratedSites] sweep budget reached; ${skippedForBudget} lower-priority sites wait for a later sweep`,
    );
  return total;
}

function aeTitleStatusToCondition(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status.includes("salvage")) return "salvage_title";
  if (status.includes("clean")) return "clean_title";
  if (status.includes("junk")) return "parts_only";
  if (status.includes("rebuilt") || status.includes("reconstruct"))
    return "rebuilt_title";
  return undefined;
}

function aeLocationToState(value?: string | null) {
  const location = String(value || "").toLowerCase();
  if (location.includes("florida") || location.includes("miami")) return "FL";
  if (location.includes("colorado") || location.includes("denver")) return "CO";
  return undefined;
}

function textClean(value?: string | null) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function titleParts(title: string) {
  const tokens = textClean(title).split(/\s+/).filter(Boolean);
  const year = extractYear(title);
  const offset = year && tokens[0] === String(year) ? 1 : 0;
  return {
    year,
    make: tokens[offset] || "",
    model: tokens.slice(offset + 1, offset + 3).join(" "),
  };
}

async function scrapeAeOfMiami(scope = getScrapeRunScope()) {
  const category = String(scope?.q || scope?.vehicleType || "").toLowerCase();
  const params = new URLSearchParams();
  if (category.includes("suv")) params.append("category[]", "suv");
  else if (category.includes("truck")) params.append("category[]", "truck");
  else if (category.includes("car") || category.includes("sedan"))
    params.append("category[]", "car");
  if (scope?.state === "FL") params.set("location", "florida");
  if (scope?.state === "CO") params.set("location", "colorado");
  if (scope?.maxPrice) params.set("price[max]", String(scope.maxPrice));

  const allDeals: Partial<Deal>[] = [];
  for (let page = 1; page <= 5; page += 1) {
    params.set("page", String(page));
    const url = `https://aeofmiami.com/api/vehicle/listed?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) throw new Error(`AE of Miami API ${res.status}`);
    const body: any = await res.json();
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const row of rows) {
      const price = extractPrice(String(row.price || ""));
      if (!price || price < 100) continue;
      const location = row.location?.name || row.location?.slug || "";
      const title = [row.name, row.body].filter(Boolean).join(" ");
      allDeals.push({
        source: "independent_dealer",
        source_deal_id: `ae-of-miami-${row.id || row.stock_number || row.slug}`,
        source_url: row.url || `https://aeofmiami.com/product/${row.slug}`,
        title:
          title || [row.year, row.make, row.model].filter(Boolean).join(" "),
        year: Number(row.year) || extractYear(row.name),
        make: row.make || "",
        model: row.model || "",
        trim: row.trim || undefined,
        ask_price: price,
        mileage: mileageFromDealerText(row.mileage),
        condition:
          aeTitleStatusToCondition(row.title_status || row.condition) ||
          "run_drive",
        damage_type: row.condition || row.damage_type || undefined,
        seller_type: "dealer",
        location_city: row.location?.city || undefined,
        location_state: aeLocationToState(location),
        images: [
          row.main_image?.large,
          row.main_image?.medium,
          row.main_image?.small,
        ].filter(Boolean),
      });
    }
    const lastPage = Number(body.meta?.last_page || 1);
    if (!rows.length || page >= lastPage) break;
  }
  const targetedDealerRun = scope?.dealerSourceIds?.includes("ae-of-miami");
  const enrichLimit = Number(
    process.env.AE_DETAIL_LIMIT || (targetedDealerRun ? allDeals.length : 24),
  );
  const detailTargets = allDeals.slice(0, Math.max(0, enrichLimit));
  if (detailTargets.length) {
    const limit = pLimit(Number(process.env.AE_DETAIL_CONCURRENCY || 4));
    const enriched = await Promise.all(
      detailTargets.map((deal) => limit(() => enrichAeOfMiamiDetail(deal))),
    );
    for (let i = 0; i < enriched.length; i += 1) {
      allDeals[i] = enriched[i];
    }
  }
  const saved = allDeals.length ? await upsertDeals(allDeals) : 0;
  const vinCount = allDeals.filter((deal) => deal.vin).length;
  console.log(
    `[CuratedSites] AE of Miami API: ${allDeals.length} fetched, ${saved} scoped rows saved (${vinCount} VIN-enriched)`,
  );
  return saved;
}

type CdgDealerConfig = {
  sourceId: string;
  name: string;
  baseUrl: string;
  inventoryUrl: string;
  city: string;
  state: string;
  defaultCondition: string;
  defaultDamage?: string;
  cardSelector: string;
  titleSelector: string;
  priceSelector: string;
  imageSelector: string;
  linkSelector: string;
  mileageSelector?: string;
  conditionSelector?: string;
  stockSelector?: string;
  titleFromCard: ($: any, card: any) => string;
};

const CDG_DEALERS: CdgDealerConfig[] = [
  {
    sourceId: "dg-auto",
    name: "D&G Auto LLC",
    baseUrl: "https://www.dgautollc.com",
    inventoryUrl: "https://www.dgautollc.com/vehicles.php",
    city: "Poplar Bluff",
    state: "MO",
    defaultCondition: "salvage_title",
    defaultDamage: "repairable",
    cardSelector: ".product-item",
    titleSelector: ".title a",
    priceSelector: ".price",
    imageSelector: ".product-item__thumb img",
    linkSelector: ".product-item__thumb a, .title a",
    mileageSelector: ".cdg-miles",
    conditionSelector: ".cdg-title",
    stockSelector: ".cdg-stock",
    titleFromCard: ($, card) => {
      const year = textClean(
        card.find(".product-item__sale .sale-txt").first().text(),
      );
      const name = textClean(card.find(".title a").first().text());
      return [year, name].filter(Boolean).join(" ");
    },
  },
  {
    sourceId: "stjames-auto",
    name: "St. James Auto & Truck Parts",
    baseUrl: "https://rebuilders.stjamesautoparts.com",
    inventoryUrl: "https://rebuilders.stjamesautoparts.com/vehicles.php",
    city: "Saint James",
    state: "MO",
    defaultCondition: "salvage_title",
    defaultDamage: "repairable",
    cardSelector: ".dlab-feed-list",
    titleSelector: ".dlab-title a",
    priceSelector: ".price",
    imageSelector: ".cdg-photo img",
    linkSelector: ".cdg-photo a, .dlab-title a",
    titleFromCard: ($, card) =>
      textClean(card.find(".dlab-title a").first().text()),
  },
  {
    sourceId: "recar",
    name: "ReCar",
    baseUrl: "https://www.recar.com",
    inventoryUrl: "https://www.recar.com/vehicles/",
    city: "Benton",
    state: "MO",
    defaultCondition: "rebuilt_title",
    defaultDamage: "repairable",
    cardSelector: ".car-list-box",
    titleSelector: ".title a",
    priceSelector: ".badge",
    imageSelector: ".media-box img",
    linkSelector: ".media-box a, .title a",
    mileageSelector: ".feature-list .value",
    conditionSelector: ".feature-list .value",
    stockSelector: ".feature-list .value",
    titleFromCard: ($, card) => {
      const heading = textClean(card.find(".title a").first().text());
      const variant = textClean(card.find(".car-type").first().text());
      return [heading, variant].filter(Boolean).join(" ");
    },
  },
];

function cdgDealerForSite(siteUrl: string) {
  const url = siteUrl.toLowerCase();
  return CDG_DEALERS.find((dealer) =>
    url.includes(new URL(dealer.baseUrl).host),
  );
}

function conditionFromDealerText(text: string, fallback: string) {
  return conditionFromTitle(text) || fallback;
}

function parseJsonLdCars($: any) {
  const cars: any[] = [];
  $('script[type="application/ld+json"]').each((_: number, el: any) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (node?.["@type"] === "Car") cars.push(node);
        if (Array.isArray(node?.["@graph"])) {
          cars.push(
            ...node["@graph"].filter(
              (entry: any) => entry?.["@type"] === "Car",
            ),
          );
        }
      }
    } catch {
      // Ignore malformed marketing JSON-LD; visible HTML parsing still runs.
    }
  });
  return cars;
}

function detailValueByLabel($: any, labelPattern: RegExp) {
  let value = "";
  $(".leftview, .config-label, th, dt").each((_: number, el: any) => {
    if (value) return;
    const label = textClean($(el).text());
    if (!labelPattern.test(label)) return;
    const sibling = $(el).next();
    const parentValue = $(el).parent().find(".rightview, td, dd").last();
    value = textClean(sibling.text()) || textClean(parentValue.text());
  });
  if (value) return value;
  $("tr, .row, .product-config tr, .leftview").each((_: number, el: any) => {
    if (value) return;
    const text = textClean($(el).text());
    if (!labelPattern.test(text)) return;
    const withoutLabel = text.replace(labelPattern, "").replace(/^[:\s]+/, "");
    if (withoutLabel) value = withoutLabel;
    const next = $(el).next();
    if (!value && next.length) value = textClean(next.text());
  });
  return value;
}

function parseDetailMileage(value: string) {
  const fromText = extractMileage(value);
  if (fromText) return fromText;
  const digits = value.replace(/[^0-9]/g, "");
  const n = Number(digits);
  return n >= 1 && n <= 500000 ? n : undefined;
}

export function extractAeOfMiamiVinFromHtml(html: string) {
  const rawCandidates = html.match(/[A-HJ-NPR-Z0-9]{17}/gi) || [];
  for (const candidate of rawCandidates) {
    if (isValidVin(candidate)) return normalizeVin(candidate);
  }
  const visibleText = textClean(html.replace(/<[^>]+>/g, " "));
  const vinNearVehicleDetails = visibleText.match(
    /Vehicle Details[\s\S]{0,800}?([A-HJ-NPR-Z0-9]{17})/i,
  )?.[1];
  const vinNearTitle = visibleText.match(
    /\b(?:19|20)\d{2}\s+[A-Z0-9][A-Z0-9\s-]{4,100}?\s+-\s+([A-HJ-NPR-Z0-9]{17})\b/i,
  )?.[1];
  return (
    extractVin(vinNearVehicleDetails || "") ||
    extractVin(vinNearTitle || "") ||
    extractVin(visibleText)
  );
}

function firstValidVin(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const vin =
      extractVin(value) || (value && isValidVin(value) ? value : null);
    if (vin) return normalizeVin(vin);
  }
  return null;
}

function imagesFromDetail($: any, baseUrl: string) {
  const images = new Set<string>();
  const add = (value?: string) => {
    if (!value) return;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(value)) return;
    images.add(normalizeUrl(value, baseUrl));
  };
  $('meta[property="og:image"]').each((_: number, el: any) =>
    add($(el).attr("content")),
  );
  $("img").each((_: number, el: any) => {
    const src = $(el).attr("src");
    if (!src) return;
    if (/logo|icon|creditcard|carfax|banner|facebook|instagram/i.test(src))
      return;
    if (!/cmsAdmin\/uploads/i.test(src)) return;
    add(src.replace("/thumb/", "/").replace("/thumb4/", "/"));
  });
  $("[data-src], [data-mfp-src], [data-exthumbimage]").each(
    (_: number, el: any) => {
      add($(el).attr("data-src"));
      add($(el).attr("data-mfp-src"));
      add($(el).attr("data-exthumbimage"));
    },
  );
  return Array.from(images).slice(0, 20);
}

async function enrichAeOfMiamiDetail(deal: Partial<Deal>) {
  const sourceUrl = deal.source_url;
  if (!sourceUrl) return deal;
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return deal;
    const html = await res.text();
    const rawVin = extractAeOfMiamiVinFromHtml(html);
    let cheerio: typeof import("cheerio");
    try {
      cheerio = await import("cheerio");
    } catch {
      return {
        ...deal,
        vin: rawVin && isValidVin(rawVin) ? normalizeVin(rawVin) : deal.vin,
      };
    }
    const $ = cheerio.load(html);
    const car = parseJsonLdCars($)[0] || {};
    const text = textClean($.root().text());
    const vin = firstValidVin(
      car.vehicleIdentificationNumber || undefined,
      detailValueByLabel($, /VIN:?/i),
      text,
      rawVin,
    );
    const mileage =
      Number(car.mileageFromOdometer?.value) ||
      parseDetailMileage(detailValueByLabel($, /Mileage|Odometer:?/i));
    const description =
      textClean(car.description) ||
      textClean($("#ActionCard").first().text()) ||
      textClean($("meta[name='description']").attr("content"));
    const images = imagesFromDetail($, "https://aeofmiami.com");
    return {
      ...deal,
      vin: vin || deal.vin,
      mileage: mileage || deal.mileage,
      images: images.length ? images : deal.images,
      description: description || deal.description,
    };
  } catch {
    return deal;
  }
}

async function enrichCdgDetail(deal: Partial<Deal>, config: CdgDealerConfig) {
  const sourceUrl = deal.source_url;
  if (!sourceUrl) return deal;
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return deal;
    const cheerio = await import("cheerio");
    const html = await res.text();
    const $ = cheerio.load(html);
    const text = textClean($.root().text());
    const car = parseJsonLdCars($)[0] || {};
    const vin =
      car.vehicleIdentificationNumber ||
      text.match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] ||
      undefined;
    const mileage =
      Number(car.mileageFromOdometer?.value) ||
      parseDetailMileage(detailValueByLabel($, /Mileage:?/i)) ||
      extractMileage(text);
    const titleText =
      car.additionalProperty?.find?.((entry: any) =>
        /title/i.test(String(entry?.name || "")),
      )?.value ||
      detailValueByLabel($, /Title:?/i) ||
      $("title").first().text();
    const images = imagesFromDetail($, config.baseUrl);
    const description =
      textClean(car.description) ||
      textClean($(".vehicle-description, .icon-bx-wraper").first().text());
    return {
      ...deal,
      vin: isValidVin(vin) ? normalizeVin(vin) : deal.vin,
      mileage: mileage || deal.mileage,
      condition: conditionFromDealerText(
        titleText,
        deal.condition || config.defaultCondition,
      ),
      images: images.length ? images : deal.images,
      description: description || deal.description,
    };
  } catch {
    return deal;
  }
}

async function scrapeCdgDealer(config: CdgDealerConfig) {
  const cheerio = await import("cheerio");
  const scope = getScrapeRunScope();
  const allDeals: Partial<Deal>[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = new URL(config.inventoryUrl);
    if (page > 1) url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) throw new Error(`${config.name} inventory ${res.status}`);
    const $ = cheerio.load(await res.text());
    const rows: Partial<Deal>[] = [];
    $(config.cardSelector).each((_, el) => {
      const card = $(el);
      const title = config.titleFromCard($, card);
      const price = extractPrice(
        textClean(card.find(config.priceSelector).first().text()),
      );
      if (!title || !price || price < 100) return;
      const href = card.find(config.linkSelector).first().attr("href") || "";
      const sourceUrl = href
        ? normalizeUrl(href, config.baseUrl)
        : config.inventoryUrl;
      const urlVin = extractVin(sourceUrl);
      const img = card.find(config.imageSelector).first().attr("src") || "";
      const conditionText = config.conditionSelector
        ? textClean(card.find(config.conditionSelector).first().text())
        : "";
      const mileageText = config.mileageSelector
        ? textClean(
            card
              .find(config.mileageSelector)
              .filter((_, node) => /mi|mile/i.test($(node).text()))
              .first()
              .text() || card.find(config.mileageSelector).first().text(),
          )
        : "";
      const stockText = config.stockSelector
        ? textClean(
            card
              .find(config.stockSelector)
              .filter((_, node) => /#/.test($(node).text()))
              .first()
              .text(),
          )
        : "";
      const stock =
        stockText
          .replace(/^#:\s*/i, "")
          .replace(/^#\s*/i, "")
          .trim() ||
        sourceUrl.split("/").filter(Boolean).pop() ||
        title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const parts = titleParts(title);
      rows.push({
        source: "independent_dealer",
        source_deal_id: `${config.sourceId}-${stock}`,
        source_url: sourceUrl,
        title,
        year: parts.year,
        make: parts.make,
        model: parts.model,
        vin: urlVin || undefined,
        ask_price: price,
        mileage: extractMileage(mileageText) || mileageFromTitle(title),
        condition: conditionFromDealerText(
          conditionText || title,
          config.defaultCondition,
        ),
        damage_type: config.defaultDamage,
        seller_type: "dealer",
        location_city: config.city,
        location_state: config.state,
        images: img ? [normalizeUrl(img, config.baseUrl)] : [],
      });
    });
    allDeals.push(...rows);
    const hasNext =
      $('a[rel="next"], .pagination .next, a.page-link.next').length > 0;
    if (!rows.length || !hasNext) break;
  }
  const targetedDealerRun = scope?.dealerSourceIds?.includes(config.sourceId);
  const enrichLimit = Number(
    process.env.CDG_DETAIL_LIMIT || (targetedDealerRun ? allDeals.length : 24),
  );
  if (enrichLimit > 0 && allDeals.length) {
    const limit = pLimit(4);
    let enriched = 0;
    const targets = allDeals.slice(0, enrichLimit);
    const detailed = await Promise.all(
      targets.map((deal) =>
        limit(async () => {
          const next = await enrichCdgDetail(deal, config);
          if (
            next.vin ||
            (next.images?.length || 0) > (deal.images?.length || 0)
          )
            enriched += 1;
          return next;
        }),
      ),
    );
    allDeals.splice(0, targets.length, ...detailed);
    console.log(
      `[CuratedSites] ${config.name} detail enriched ${enriched}/${targets.length}`,
    );
  }
  const saved = allDeals.length ? await upsertDeals(allDeals) : 0;
  console.log(
    `[CuratedSites] ${config.name} CDG parser: ${allDeals.length} fetched, ${saved} rows accepted`,
  );
  return saved;
}

// Re-export other source modules
export { scrapeEbayMotors, EBAY_MOTORS_CONFIG } from "./ebay-motors";
export { scrapeIAA } from "./iaa";
export { scrapeAcv, ACV_CONFIG } from "./acv";
export { scrapeCarPartsCom, CARPARTS_COM_CONFIG } from "./carparts-com";
export {
  scrapeFacebookMarketplace,
  FACEBOOK_MARKETPLACE_CONFIG,
} from "./facebook-marketplace";
export { scrapeAdesa, ADESA_CONFIG } from "./adesa";
export { scrapeManheim, MANHEIM_CONFIG } from "./manheim";
export {
  scrapeCarsCom,
  scrapeCarsComAllStates,
  CARS_COM_CONFIG,
} from "./cars-com";
