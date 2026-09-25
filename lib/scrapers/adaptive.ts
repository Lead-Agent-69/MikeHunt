// Adaptive scheduling: instead of round-robin shards, scrape the STALEST regions first — cities
// never scraped, or whose newest deal is oldest. Coverage self-optimizes toward whatever's gone
// cold. Also exposes how stale the fleet is so the caller can scale its effort (freshness-aware
// cadence): light touch when everything's fresh, bigger batches to catch up when it's behind.

import { createClient } from "@supabase/supabase-js";
import { CRAIGSLIST_SITES } from "@/lib/geo";

export interface CityStaleness {
  site: string;
  ageHours: number | null; // null = never scraped (maximally stale)
}

/** Rank every Craigslist city stalest-first by the age of its most recent deal. */
export async function rankCitiesByStaleness(): Promise<CityStaleness[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sites: string[] = CRAIGSLIST_SITES.map((s) => s.site);
  if (!url || !key || sites.length === 0) return [];

  const lastByCity = new Map<string, number>();
  try {
    const sb = createClient(url, key);
    const { data } = await sb
      .from("deals")
      .select("location_city, updated_at")
      .like("source", "craigslist%")
      .not("location_city", "is", null)
      .order("updated_at", { ascending: false })
      .limit(8000);
    for (const row of data || []) {
      const c = String(row.location_city).toLowerCase();
      if (!lastByCity.has(c))
        lastByCity.set(c, new Date(row.updated_at).getTime());
    }
  } catch {
    return [];
  }

  const now = Date.now();
  return sites
    .map((site) => {
      const last = lastByCity.get(site.toLowerCase());
      return {
        site,
        ageHours: last == null ? null : (now - last) / 3600_000,
      };
    })
    .sort((a, b) => {
      const av = a.ageHours == null ? Infinity : a.ageHours;
      const bv = b.ageHours == null ? Infinity : b.ageHours;
      return bv - av; // stalest first
    });
}

/** How many cities to scrape this run, scaled to how far behind the fleet is. */
export function recommendBatchSize(
  ranked: CityStaleness[],
  opts: { staleHours?: number; min?: number; max?: number } = {},
): number {
  const staleHours = opts.staleHours ?? 4;
  const min = opts.min ?? 6;
  const max = opts.max ?? 24;
  const stale = ranked.filter(
    (c) => c.ageHours == null || c.ageHours > staleHours,
  ).length;
  return Math.max(min, Math.min(max, stale));
}

/** Backward-compatible: the N stalest city subdomains. */
export async function selectStaleCities(count: number): Promise<string[]> {
  const ranked = await rankCitiesByStaleness();
  return ranked.slice(0, Math.max(1, count)).map((c) => c.site);
}
