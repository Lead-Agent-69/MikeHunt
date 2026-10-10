// lib/scrapers/source-index.test.ts
//
// Drift guard for the two source registries. If someone adds a scraper to runner.ts without
// recording it here (or deletes one without cleaning up), this fails in CI rather than letting
// the /sources dashboard quietly report the wrong coverage.

import { describe, it, expect } from "vitest";
import { createScraperRegistry } from "./runner";
import { ALL_SOURCES, SOURCE_STATS } from "./sources-registry";
import {
  IMPLEMENTED_SCRAPER_IDS,
  RUNNER_ONLY_META_SOURCES,
  normalizeSourceId,
  hasScraper,
  hasSharedImporter,
  catalogForRunnerId,
  findSource,
  scraperCoverage,
} from "./source-index";

function runnerIds(): string[] {
  const registry = createScraperRegistry();
  // ScraperRegistry exposes its registrations; fall back to getEnabled()+all ids if the shape differs.
  const anyRegistry = registry as unknown as {
    list?: () => Array<{ id: string }>;
    getAll?: () => Array<{ id: string }>;
    entries?: Array<{ id: string }>;
    sources?: Map<string, unknown>;
    registry?: Map<string, { id: string }>;
  };
  if (typeof anyRegistry.list === "function")
    return anyRegistry.list().map((s) => s.id);
  if (typeof anyRegistry.getAll === "function")
    return anyRegistry.getAll().map((s) => s.id);
  if (Array.isArray(anyRegistry.entries))
    return anyRegistry.entries.map((s) => s.id);
  if (anyRegistry.sources instanceof Map)
    return Array.from(anyRegistry.sources.keys()) as string[];
  if (anyRegistry.registry instanceof Map)
    return Array.from(anyRegistry.registry.values()).map((s) => s.id);
  throw new Error(
    "source-index.test: could not enumerate the scraper registry — ScraperRegistry changed shape.",
  );
}

describe("source index / registry consistency", () => {
  it("enumerates the runner registry", () => {
    const ids = runnerIds();
    expect(ids.length).toBeGreaterThan(0);
  });

  it("every runner source has an entry in IMPLEMENTED_SCRAPER_IDS", () => {
    const declared = new Set(IMPLEMENTED_SCRAPER_IDS.map(normalizeSourceId));
    const missing = runnerIds()
      .map(normalizeSourceId)
      .filter((id) => !declared.has(id));
    expect(missing).toEqual([]);
  });

  it("every IMPLEMENTED_SCRAPER_IDS entry is still registered in the runner", () => {
    const live = new Set(runnerIds().map(normalizeSourceId));
    const stale = IMPLEMENTED_SCRAPER_IDS.map(normalizeSourceId).filter(
      (id) => !live.has(id),
    );
    expect(stale).toEqual([]);
  });

  it("has no duplicate ids after normalization", () => {
    const normalized = IMPLEMENTED_SCRAPER_IDS.map(normalizeSourceId);
    expect(new Set(normalized).size).toBe(normalized.length);

    const catalog = ALL_SOURCES.map((s) => normalizeSourceId(s.id));
    expect(new Set(catalog).size).toBe(catalog.length);
  });

  it("meta-sources are runner-only and absent from the catalog", () => {
    for (const meta of RUNNER_ONLY_META_SOURCES) {
      expect(IMPLEMENTED_SCRAPER_IDS).toContain(meta);
      expect(findSource(meta)).toBeUndefined();
    }
  });

  it("bridges the underscore/hyphen id mismatch between the two registries", () => {
    // runner uses underscores, catalog uses hyphens
    expect(hasScraper("ebay_motors")).toBe(true);
    expect(hasScraper("ebay-motors")).toBe(true);
    expect(catalogForRunnerId("ebay_motors")?.id).toBe("ebay-motors");
    expect(catalogForRunnerId("facebook_marketplace")?.id).toBe(
      "facebook-marketplace",
    );
    expect(catalogForRunnerId("cars_com")?.id).toBe("cars-com");
    expect(catalogForRunnerId("gsa_auctions")?.id).toBe("gsa-auctions");
  });

  it("recognizes catalog dealers covered by the shared targeted importer", () => {
    // A&E of Miami and ReCar were retired 2026-10-09 (terms ban scraping / reuse): no importer.
    expect(hasSharedImporter(findSource("ae-of-miami")!)).toBe(false);
    expect(hasSharedImporter(findSource("dg-auto")!)).toBe(true);
    expect(hasSharedImporter(findSource("recar")!)).toBe(false);
    expect(hasSharedImporter(findSource("stjames-auto")!)).toBe(true);
    expect(hasSharedImporter(findSource("damage-com")!)).toBe(true);
    expect(hasSharedImporter(findSource("copart")!)).toBe(false);
  });

  it("reports coherent coverage numbers", () => {
    const cov = scraperCoverage();
    expect(cov.catalogued).toBe(ALL_SOURCES.length);
    expect(cov.catalogued).toBe(SOURCE_STATS.total);
    expect(cov.implemented + cov.sharedImported + cov.catalogOnly).toBe(
      cov.catalogued,
    );
    expect(cov.planned).toBe(cov.catalogOnly);
    expect(cov.sharedImported).toBeGreaterThan(0);
    expect(cov.ratio).toBeGreaterThanOrEqual(0);
    expect(cov.ratio).toBeLessThanOrEqual(1);
    expect(cov.missing.length).toBe(cov.catalogOnly);
    // The catalog is intentionally much wider than what's scraped — if this ever reads 100%,
    // someone mass-flipped status without writing scrapers.
    expect(cov.implemented).toBeLessThan(cov.catalogued);
  });
});
