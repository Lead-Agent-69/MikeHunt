// lib/scrapers/sources/index.ts
// ─── Per-source scraper implementations ──────────────────────────────────────

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
import pLimit from "p-limit";

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

export async function enrichCraigslistDetail(
  url: string,
): Promise<Partial<Deal>> {
  try {
    const axios = (await import("axios")).default;
    const cheerio = await import("cheerio");
    const res = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      timeout: 12000,
    });
    const $ = cheerio.load(res.data);
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
  } catch {
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
        const extra = await enrichCraigslistDetail(d.source_url as string);
        if (Object.keys(extra).length) {
          Object.assign(d, extra);
          enriched++;
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

export async function scrapeCraigslist(
  query = "cars+trucks",
  minPrice = 500,
  maxPrice = 35000,
) {
  console.log(
    `[Craigslist] Scanning ${CL_CITIES.length} cities × ${CL_CHANNELS.length} channels...`,
  );
  const allDeals: Partial<Deal>[] = [];

  for (const city of CL_CITIES) {
    for (const channel of CL_CHANNELS) {
      const gen = paginate<Partial<Deal>>(
        CL_CONFIG,
        (page) =>
          `https://${city}.craigslist.org/search/${channel.path}?` +
          `query=${query}&min_price=${minPrice}&max_price=${maxPrice}&s=${(page - 1) * 120}`,
        async ($raw) => {
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
                source_deal_id:
                  url?.split("/").pop()?.replace(".html", "") || "",
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
        },
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
): Promise<number> {
  console.log(`[IndiDealer] Scraping ${profile.name} at ${baseUrl}`);
  const allDeals: Partial<Deal>[] = [];
  const config = {
    ...INDI_CONFIG,
    baseUrl,
    renderMode: profile.renderMode || "browser",
  };
  const sel = profile.selectors;

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
      const $ = cheerio.load(typeof rawHtml === "string" ? rawHtml : "");
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

      // FREE structured rescue (no API cost) — runs BEFORE the paid LLM rescue. Many dealer sites embed
      // their inventory as JSON-LD or __NEXT_DATA__ even when our CSS selectors miss; the generic
      // extractor recovers those for $0. No-paid-first (standing constraint): only if this also finds
      // nothing do we fall through to the cost-gated AI rescue below.
      if (
        items.length === 0 &&
        typeof rawHtml === "string" &&
        rawHtml.length > 1500
      ) {
        const { genericExtract } = await import("../generic-extractor");
        for (const g of genericExtract(rawHtml, "independent_dealer")) {
          if (!g.make && !g.title) continue;
          items.push({
            source: "independent_dealer",
            source_deal_id:
              (g.source_url && g.source_url !== baseUrl
                ? g.source_url.split("/").filter(Boolean).pop()
                : "") ||
              `${profile.dealerId}-${[g.year, g.make, g.model, g.ask_price, g.mileage].filter(Boolean).join("-")}`,
            source_url: g.source_url
              ? normalizeUrl(g.source_url, baseUrl)
              : baseUrl,
            title:
              [g.year, g.make, g.model].filter(Boolean).join(" ") ||
              g.title ||
              "",
            year: g.year,
            make: g.make || "",
            model: g.model || "",
            ask_price: g.ask_price || 0,
            mileage: g.mileage,
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
        }
        if (items.length)
          console.log(
            `[IndiDealer] ${profile.name}: genericExtract rescued ${items.length} (selector miss, free)`,
          );
      }

      // AI rescue: generic selectors AND the free structured rescue both matched nothing. When that
      // happens (and the page genuinely has content), let the LLM extract the listings. Cost-gated —
      // only fires on a double miss, only when a provider key + AI_SCRAPE_EXTRACT are configured.
      if (
        items.length === 0 &&
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
      return { items, hasMore: hasNext && items.length > 0 };
    },
  );

  for await (const batch of gen) allDeals.push(...batch);

  console.log(`[IndiDealer] ${profile.name}: Found ${allDeals.length} deals`);
  // dealer_id is a UUID FK; these auto-discovered sites have no dealers-table row, so leave it null.
  // A hostname slug ("auto-www.damage.com") fails the uuid type and silently drops every row.
  await upsertDeals(allDeals);
  return allDeals.length;
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
): Promise<number> {
  console.log(`[AutoDiscover] Analyzing ${dealerWebsite}`);

  const { html, close } = await fetchBrowser(dealerWebsite, {
    ...INDI_CONFIG,
    baseUrl: dealerWebsite,
  });
  await close();

  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  // Find inventory link. Two-pass + guarded: a link whose HREF points at an inventory path is far more
  // reliable than one matched only on link text, so we prefer href matches and fall back to text. We
  // skip non-navigational hrefs (javascript:void(0), #, mailto:, tel:) — those were silently becoming
  // the "inventory URL" and aborting the whole crawl (e.g. damage.com's JS nav toggle).
  const navigational = (href: string) =>
    href &&
    !/^(javascript:|#|mailto:|tel:|data:)/i.test(href.trim()) &&
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

  return scrapeIndependentDealer(profile, dealerWebsite);
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
): Promise<number> {
  const sites = CURATED_SITES.slice(0, maxSites);
  console.log(
    `[CuratedSites] Crawling ${sites.length} curated salvage/dealer sites...`,
  );
  let total = 0;
  const yields: { name: string; state?: string; type: string; n: number }[] =
    [];
  for (const site of sites) {
    const d = SITE_TYPE_DEFAULTS[site.type];
    try {
      const n = await autoDiscoverAndCrawl(site.url, {
        name: site.name,
        city: site.city,
        state: site.state,
        conditionDefault: d.condition,
        damageDefault: d.damage_type,
        sellerDefault: d.seller_type,
        inventoryUrl: site.inventoryUrl,
      });
      console.log(
        `[CuratedSites] ${site.name} (${site.type}${site.state ? `/${site.state}` : ""}): ${n} listings`,
      );
      yields.push({ name: site.name, state: site.state, type: site.type, n });
      total += n;
    } catch (e) {
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
    `[CuratedSites] ${total} listings · ${live.length}/${sites.length} sites live · ${states.size} states covered`,
  );
  if (dead.length)
    console.log(`[CuratedSites] no yield (check/prune): ${dead.join(", ")}`);
  return total;
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
