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
import { getDomain, parse as parseHost } from "tldts";
import { ALL_SOURCES } from "../sources-registry";
import { currentPoliteSource } from "./source-context";

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

/**
 * One static exemption: a host, the paths on it the source actually uses, and the runner ids that
 * may use it. Ren's #269 review: an exemption is source-plus-path, never host-wide, so ebay-sold
 * (/sch/i.html) does not also exempt ebay_motors (/sch/6001/i.html) on the same host.
 */
export interface StaticExemption {
  sourceId: string;
  host: string;
  /** null = every path on the host (the registry URL is the site root). */
  paths: string[] | null;
  /** Normalized runner ids allowed to use this exemption (the registry id plus exemptRunnerIds). */
  runners: Set<string>;
}

const staticExemptions: StaticExemption[] = [];
const staticHosts = new Set<string>();

/** "/sch/i.html" matches that path exactly; "/marketplace/*" matches the prefix. */
export function pathMatches(pathname: string, patterns: string[] | null): boolean {
  if (!patterns) return true;
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return patterns.some((pat) => {
    if (pat.endsWith("*")) {
      const prefix = pat.slice(0, -1).replace(/\/+$/, "");
      return p === (prefix || "/") || p.startsWith(`${prefix}/`) || prefix === "";
    }
    return p === (pat.replace(/\/+$/, "") || "/");
  });
}

function defaultPaths(url: string): string[] | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path ? [path, `${path}/*`] : null;
  } catch {
    return null;
  }
}

for (const s of ALL_SOURCES) {
  if (!s.robotsExempt) continue;
  const id = normalizeExemptId(s.id);
  staticSources.add(id);
  const runners = new Set([id, ...(s.exemptRunnerIds ?? []).map(normalizeExemptId)]);
  const mainHost = bareHost(s.url);
  const paths = s.exemptPaths ?? defaultPaths(s.url);
  if (mainHost) {
    staticHosts.add(mainHost);
    staticExemptions.push({ sourceId: id, host: mainHost, paths, runners });
  }
  for (const h of s.exemptHosts ?? []) {
    const host = bareHost(h);
    if (!host) continue;
    staticHosts.add(host);
    // Extra API/CDN hosts are owned by the source: every path on them.
    staticExemptions.push({ sourceId: id, host, paths: null, runners });
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
  runtimeHosts = new Set((p.hosts ?? []).map(bareHost).filter(isExemptableHost));
  refreshedAt = Date.now();
}

/**
 * A host may join the run-time exempt set only if it is a registrable domain or a subdomain of one
 * (public-suffix list, private suffixes included): never an IP, a bare TLD ("com"), a public suffix
 * ("co.uk", "github.io") or a single-label name. Otherwise a planted row like https://com would
 * exempt every .com host from robots.txt via the endsWith match.
 */
export function isExemptableHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h || !h.includes(".")) return false;
  if (parseHost(h, { allowPrivateDomains: true }).isIp) return false;
  const domain = getDomain(h, { allowPrivateDomains: true });
  return !!domain && (h === domain || h.endsWith(`.${domain}`));
}

function hostMatches(host: string, set: Set<string>): boolean {
  if (!host) return false;
  return Array.from(set).some((h) => host === h || host.endsWith(`.${h}`));
}

function staticExemptionMatches(url: string, runner: string | undefined): boolean {
  let host = "";
  let pathname = "/";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    pathname = u.pathname;
  } catch {
    return false;
  }
  const r = runner ? normalizeExemptId(runner) : undefined;
  return staticExemptions.some(
    (e) =>
      (host === e.host || host.endsWith(`.${e.host}`)) &&
      pathMatches(pathname, e.paths) &&
      (!r || e.runners.has(r)),
  );
}

/**
 * Is this URL grandfathered (skip the robots.txt disallow check)? Static (registry) exemptions match
 * source-plus-path: the URL's host and path must be ones the flagged source uses, and when the
 * calling source is known (`sourceId`, or the current run's source from source-context.ts) it must
 * be that source. The run-time "rows in the last 7 days" set is host-wide, unchanged (that scope
 * waits on Jonah's decision).
 */
export function isRobotsExemptUrl(url: string, sourceId?: string): boolean {
  const runner = sourceId ?? currentPoliteSource();
  return staticExemptionMatches(url, runner) || hostMatches(bareHost(url), runtimeHosts);
}

/** Static exemptions (tests, /status). */
export function staticRobotsExemptions(): readonly StaticExemption[] {
  return staticExemptions;
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
    // Rows found through an aggregator (options.discoveredVia: Visor, AutoTempest) point at hosts we
    // never crawled ourselves, so they must not grandfather those hosts past robots.txt.
    const deals = await client
      .from("deals")
      .select("source_url, discovered_via:options->>discoveredVia")
      .gte("last_seen_at", since)
      .is("options->>discoveredVia", null)
      .limit(20000);
    if (deals.error) throw deals.error;
    const sources = Array.from(
      new Set<string>((runs.data ?? []).map((r: { source: string }) => r.source)),
    );
    const hosts = Array.from(
      new Set<string>(
        (deals.data ?? [])
          .filter((d: { discovered_via?: string | null }) => !d.discovered_via)
          .map((d: { source_url: string | null }) => bareHost(String(d.source_url || "")))
          .filter(isExemptableHost),
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
