/**
 * Robots.txt exemption for grandfathered sources.
 *
 * Jonah's standing rule: never remove or disable a MikeHunt source, and never stop a scraper that is
 * already working. Polite mode is the default (#269), but its robots.txt disallow skip applies only
 * to NEW sources and to sources that produced 0 rows recently. A grandfathered source keeps running
 * exactly as before (its own fetch path, headers and tools) with only the polite per-domain random
 * delays, backoff and circuit breaker added (see politeGate).
 *
 * Grandfathered =
 *  1. registry entries flagged `robotsExempt` (the list Jonah restored: CarGurus, FB Marketplace,
 *     Salvage Trucks, A&E, Royal Drive, Parts Farm, ReCar, eBay sold), plus
 *  2. at run time, every source that produced rows in the last 7 days: scraper_runs sources with
 *     deals_found > 0, and the seller hosts of deals last seen in the last 7 days (so a dealer inside
 *     an aggregate run like curated_dealers is matched by its own host).
 */
import { ALL_SOURCES } from "../sources-registry";

const RECENT_DAYS = 7;
const REFRESH_MS = 60 * 60_000;

function bareHost(value: string): string {
  const v = value.trim().toLowerCase();
  try {
    return new URL(v.includes("://") ? v : `https://${v}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Runner / scraper_runs ids look like `ebay_sold`; registry ids like `ebay-sold`. */
export function normalizeExemptId(id: string): string {
  return String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

const staticSources = new Set<string>();
const staticHosts = new Set<string>();
for (const s of ALL_SOURCES) {
  if (!s.robotsExempt) continue;
  staticSources.add(normalizeExemptId(s.id));
  for (const h of [s.url, ...(s.exemptHosts ?? [])]) {
    const host = bareHost(h);
    if (host) staticHosts.add(host);
  }
}

let runtimeSources = new Set<string>();
let runtimeHosts = new Set<string>();
let refreshedAt = 0;

/** Hosts and source ids Jonah grandfathered by name (static, from the registry flag). */
export function grandfatheredSourceIds(): string[] {
  return Array.from(staticSources);
}
export function grandfatheredHosts(): string[] {
  return Array.from(staticHosts);
}

/** Replace the "produced rows in the last 7 days" set (from refreshRecentProducers or a test). */
export function setRecentProducers(p: { sources?: string[]; hosts?: string[] }) {
  runtimeSources = new Set((p.sources ?? []).map(normalizeExemptId));
  runtimeHosts = new Set((p.hosts ?? []).map(bareHost).filter(Boolean));
  refreshedAt = Date.now();
}

function hostMatches(host: string, set: Set<string>): boolean {
  if (!host) return false;
  return Array.from(set).some((h) => host === h || host.endsWith(`.${h}`));
}

/** Is this URL's host grandfathered (skip the robots.txt disallow check)? */
export function isRobotsExemptUrl(url: string): boolean {
  const host = bareHost(url);
  return hostMatches(host, staticHosts) || hostMatches(host, runtimeHosts);
}

/** Is this source id grandfathered (named by Jonah, or produced rows in the last 7 days)? */
export function isRobotsExemptSource(id: string): boolean {
  const k = normalizeExemptId(id);
  return staticSources.has(k) || runtimeSources.has(k);
}

interface ProducerClient {
  from(table: string): any;
}

/**
 * Load the last-7-days producers from Supabase (service role). Cheap: two small grouped reads,
 * refreshed at most hourly. On any error the previous set is kept (never shrinks to nothing on a
 * transient failure, which would start skipping working sources).
 */
export async function refreshRecentProducers(
  client: ProducerClient,
  now: number = Date.now(),
): Promise<{ sources: number; hosts: number } | null> {
  if (refreshedAt && now - refreshedAt < REFRESH_MS) return null;
  const since = new Date(now - RECENT_DAYS * 86_400_000).toISOString();
  try {
    const runs = await client
      .from("scraper_runs")
      .select("source, deals_found")
      .gte("started_at", since)
      .gt("deals_found", 0)
      .limit(5000);
    if (runs.error) throw runs.error;
    const deals = await client
      .from("deals")
      .select("source_url")
      .gte("last_seen_at", since)
      .limit(20000);
    if (deals.error) throw deals.error;
    const sources = Array.from(
      new Set<string>((runs.data ?? []).map((r: { source: string }) => r.source)),
    );
    const hosts = Array.from(
      new Set<string>(
        (deals.data ?? [])
          .map((d: { source_url: string | null }) => bareHost(String(d.source_url || "")))
          .filter(Boolean),
      ),
    );
    setRecentProducers({ sources, hosts });
    return { sources: sources.length, hosts: hosts.length };
  } catch (error) {
    console.warn(
      `[polite] could not refresh recent producers (keeping previous set): ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

/** Test hook. */
export function resetRecentProducers() {
  runtimeSources = new Set();
  runtimeHosts = new Set();
  refreshedAt = 0;
}
