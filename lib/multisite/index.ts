import { MULTISITE_SITES } from "./sites";
import { normalizeFilters } from "./normalize";
import type { MultiSiteFilters, MultiSiteLink } from "./types";

export * from "./types";
export { normalizeFilters } from "./normalize";
export { MULTISITE_SITES, EXCLUDED_SITES, CARGURUS_ENTITY_IDS } from "./sites";

/**
 * Outbound search links for the buyer's current filters. Only browser-confirmed formats unless
 * `includeUnverified`. Sites that can't express the search (e.g. Craigslist without a ZIP) are skipped.
 */
export function buildMultiSiteLinks(
  raw: MultiSiteFilters | Record<string, unknown>,
  opts: { includeUnverified?: boolean } = {},
): MultiSiteLink[] {
  const filters = normalizeFilters(raw as Record<string, unknown>);
  const links: MultiSiteLink[] = [];
  for (const site of MULTISITE_SITES) {
    if (!site.verified && !opts.includeUnverified) continue;
    const l = site.build(filters);
    if (!l) continue;
    if (!l.verified && !opts.includeUnverified) continue;
    links.push(l);
  }
  return links;
}
