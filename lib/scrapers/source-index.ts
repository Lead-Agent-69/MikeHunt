// lib/scrapers/source-index.ts
//
// The project grew TWO source registries that nobody reconciled:
//
//   1. lib/scrapers/runner.ts          — the LIVE registry. `createScraperRegistry()` registers the
//      26 sources the pipeline actually runs, each with an `enabled` flag and a scraper `fn`.
//   2. lib/scrapers/sources-registry.ts — the CATALOG. 50+ researched sites with metadata for the
//      /sources dashboard (url, priority, auth requirements, FlareSolverr needs).
//
// They used different id spellings (runner `ebay_motors` vs catalog `ebay-motors`), so nothing could
// answer "of the sites we've researched, which ones can we actually scrape right now?"
//
// This module is that answer. It is intentionally dependency-free (no imports from runner.ts) so the
// dashboard can use it without pulling Playwright/patchright into the client bundle — instead the
// IMPLEMENTED_SCRAPER_IDS constant below is asserted against the real runner registry by
// lib/scrapers/source-index.test.ts, so drift fails CI instead of shipping silently.

import {
  ALL_SOURCES,
  getSourceById,
  type SourceConfig,
} from "./sources-registry";
import { CURATED_SITES } from "./curated-sites";

/**
 * Sources registered in `createScraperRegistry()` (lib/scrapers/runner.ts) — i.e. ones with a
 * working scraper function. Keep in sync with runner.ts; the test enforces it.
 *
 * Underscore spellings are the runner's ids; matching is done through normalizeSourceId().
 */
export const IMPLEMENTED_SCRAPER_IDS: readonly string[] = [
  "copart",
  "craigslist",
  "iaa",
  "acv",
  "adesa",
  "manheim",
  "facebook_marketplace",
  "ebay_motors",
  "carparts_com",
  "cars_com",
  "independent_dealer",
  "cargurus",
  "autotrader",
  "truecar",
  "carvana",
  "vroom",
  "ebay_sold",
  "curated_dealers",
  "autotempest",
  "visor",
  "publicsurplus",
  "govdeals",
  "allsurplus",
  "municibid",
  "gsa_auctions",
  "offerup",
  "auto_discover",
];

/**
 * Meta-sources that exist only in the runner and are not a single scrapeable website.
 * They are intentionally absent from the catalog, so the consistency test skips them.
 */
export const RUNNER_ONLY_META_SOURCES: readonly string[] = [
  "independent_dealer", // fan-out across many small dealer sites
  "curated_dealers", // curated list, not one domain
  "auto_discover", // crawler discovery mode
];

/**
 * Normalize a source id so the two registries' spellings compare equal.
 * `ebay_motors` / `ebay-motors` / `Ebay Motors` all become `ebay-motors`.
 */
export function normalizeSourceId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const implemented = new Set(IMPLEMENTED_SCRAPER_IDS.map(normalizeSourceId));

function hostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const sharedImporterHosts = CURATED_SITES.map((site) =>
  hostname(site.url),
).filter(Boolean);

/** True when a working scraper is wired into the runner for this source id. */
export function hasScraper(id: string): boolean {
  return implemented.has(normalizeSourceId(id));
}

/** True when a catalog site can be selected through the targeted curated-dealer importer. */
export function hasSharedImporter(source: Pick<SourceConfig, "url">): boolean {
  const sourceHost = hostname(source.url);
  if (!sourceHost) return false;

  return sharedImporterHosts.some(
    (curatedHost) =>
      curatedHost === sourceHost ||
      curatedHost.endsWith(`.${sourceHost}`) ||
      sourceHost.endsWith(`.${curatedHost}`),
  );
}

/** Look up catalog metadata for a runner source id (handles underscore/hyphen mismatch). */
export function catalogForRunnerId(runnerId: string): SourceConfig | undefined {
  const key = normalizeSourceId(runnerId);
  return ALL_SOURCES.find((s) => normalizeSourceId(s.id) === key);
}

/** Catalog lookup by either spelling of an id. */
export function findSource(id: string): SourceConfig | undefined {
  const key = normalizeSourceId(id);
  return (
    ALL_SOURCES.find((s) => normalizeSourceId(s.id) === key) ??
    getSourceById(id)
  );
}

export interface ScraperCoverage {
  /** Sites in the research catalog. */
  catalogued: number;
  /** Catalogued sites that also have a working scraper. */
  implemented: number;
  /** Catalogued sites targetable through the curated-dealer importer, without a dedicated runner. */
  sharedImported: number;
  /** Catalogued sites with metadata only (no direct or shared importer yet). */
  catalogOnly: number;
  /** Backwards-compatible alias for catalogOnly. */
  planned: number;
  /** Runner sources that aren't a single website (meta-sources). */
  runnerOnly: number;
  /** Selectable coverage (dedicated + shared importer) as 0-1. */
  ratio: number;
  /** Catalogued source ids that have no direct or shared importer — the build queue. */
  missing: string[];
}

/**
 * Coverage summary: how much of the researched catalog is actually wired up.
 * Drives the badge on /sources and the drift assertions in the test.
 */
export function scraperCoverage(): ScraperCoverage {
  const catalogued = ALL_SOURCES;
  const missing = catalogued
    .filter((s) => !hasScraper(s.id) && !hasSharedImporter(s))
    .map((s) => s.id)
    .sort();
  const implementedCount = catalogued.filter((s) => hasScraper(s.id)).length;
  const sharedImported = catalogued.filter(
    (s) => !hasScraper(s.id) && hasSharedImporter(s),
  ).length;
  const selectableCount = implementedCount + sharedImported;

  return {
    catalogued: catalogued.length,
    implemented: implementedCount,
    sharedImported,
    catalogOnly: missing.length,
    planned: missing.length,
    runnerOnly: RUNNER_ONLY_META_SOURCES.length,
    ratio: catalogued.length ? selectableCount / catalogued.length : 0,
    missing,
  };
}
