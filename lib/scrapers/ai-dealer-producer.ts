// lib/scrapers/ai-dealer-producer.ts
//
// The PRODUCER that activates the previously-orphaned micro-AI parse path.
//
// Context: lib/scrapers/ai-crawler.ts (deterministic-first, AI-fallback VDP discovery) enqueues VDP URLs
// onto aiParsingQueue, and workers/ai-worker.ts (imported by the scrape-worker fleet) consumes them:
// Playwright-render → Gemini structured extraction → valuation → real transport cost → upsert. But NOTHING
// triggered the crawler in batch — only the manual save-from-url route ever enqueued. This module closes
// that loop for the curated independent salvage / rebuilder / dealer network, which is exactly the class
// of sites a blanket-CSS competitor cannot parse (every lot has a bespoke layout).
//
// Cost discipline (honors the $0 / free-tier rule): we only touch dealer types that are NOT already
// covered by dedicated auction scrapers (auction_proxy is skipped — govdeals/municibid/gsa/etc. handle
// those), we cap sites-per-cycle and VDPs-per-site, and the crawler itself is deterministic-first so AI
// only fires on ambiguous link sets. Everything is env-tunable and the whole producer is best-effort.

import {
  CURATED_SITES,
  type CuratedSite,
  type CuratedSiteType,
} from "./curated-sites";

/** Dealer types worth running through the AI crawler. auction_proxy is deliberately excluded — those
 *  domains already have dedicated structured scrapers, so AI-parsing them would only duplicate cost. */
const CRAWLABLE_TYPES: ReadonlySet<CuratedSiteType> = new Set<CuratedSiteType>([
  "salvage_yard",
  "rebuilder_dealer",
  "independent_dealer",
  "clean_retail",
]);

export interface DealerCrawlOptions {
  /** Max curated sites to crawl this cycle (0 = disabled). Default 8. */
  maxSites?: number;
  /** Max VDPs to enqueue per site (bounds Gemini spend). Default 12. */
  perSiteCap?: number;
  /** Override the curated list (tests / targeted runs). */
  sites?: CuratedSite[];
  /** Inject the crawler (tests). Defaults to the real adaptive AI crawler. */
  crawl?: (
    url: string,
    dealerId: string | undefined,
    maxVdps: number,
  ) => Promise<number>;
}

export interface DealerCrawlResult {
  sitesAttempted: number;
  sitesSucceeded: number;
  vdpQueued: number;
  errors: string[];
}

const DEFAULT_MAX_SITES = 8;
const DEFAULT_PER_SITE_CAP = 12;

/** Resolve dealer inventory URL: prefer an explicit inventoryUrl, else the site root. */
function inventoryUrlFor(site: CuratedSite): string {
  return site.inventoryUrl ?? site.url;
}

/**
 * Run the AI crawler across a bounded slice of the curated dealer network and return the number of VDPs
 * enqueued onto aiParsingQueue. Never throws — a bad site is logged and skipped so one walled dealer can
 * never fail an entire scrape cycle.
 */
export async function queueCuratedDealerInventory(
  options: DealerCrawlOptions = {},
): Promise<DealerCrawlResult> {
  const {
    maxSites = DEFAULT_MAX_SITES,
    perSiteCap = DEFAULT_PER_SITE_CAP,
    sites = CURATED_SITES,
  } = options;

  const result: DealerCrawlResult = {
    sitesAttempted: 0,
    sitesSucceeded: 0,
    vdpQueued: 0,
    errors: [],
  };

  if (maxSites <= 0) return result;

  const crawlable = sites
    .filter((s) => CRAWLABLE_TYPES.has(s.type))
    .slice(0, maxSites);

  if (crawlable.length === 0) return result;

  // Lazy import so merely importing this module (e.g. from scrape-ci) never forces a Playwright /
  // Google-GenAI / Redis-queue load unless the producer actually runs.
  const crawl =
    options.crawl ?? (await import("./ai-crawler")).crawlInventoryAndQueueVDPs;

  console.log(
    `[AI Dealer Producer] Crawling ${crawlable.length} curated dealer sites (per-site cap=${perSiteCap}).`,
  );

  for (const site of crawlable) {
    const url = inventoryUrlFor(site);
    result.sitesAttempted++;
    try {
      const queued = await crawl(url, undefined, perSiteCap);
      result.sitesSucceeded++;
      result.vdpQueued += queued;
    } catch (err) {
      const msg = `${site.name} (${url}): ${(err as Error)?.message ?? String(err)}`;
      result.errors.push(msg);
      console.warn(`[AI Dealer Producer] skipped ${msg}`);
    }
  }

  console.log(
    `[AI Dealer Producer] done — ${result.sitesSucceeded}/${result.sitesAttempted} sites, ${result.vdpQueued} VDPs queued.`,
  );
  return result;
}

/** Env-driven wrapper used by scrape-ci. Disabled unless ENABLE_AI_DEALER_CRAWL=1. */
export async function maybeQueueCuratedDealerInventoryFromEnv(): Promise<DealerCrawlResult | null> {
  if (process.env.ENABLE_AI_DEALER_CRAWL !== "1") return null;
  const maxSites = parseInt(
    process.env.AI_CRAWL_SITES_MAX ?? String(DEFAULT_MAX_SITES),
    10,
  );
  const perSiteCap = parseInt(
    process.env.AI_CRAWL_VDP_CAP ?? String(DEFAULT_PER_SITE_CAP),
    10,
  );
  return queueCuratedDealerInventory({ maxSites, perSiteCap });
}
