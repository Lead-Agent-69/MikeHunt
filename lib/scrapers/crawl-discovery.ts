// lib/scrapers/crawl-discovery.ts
//
// The chameleon's nose. Point it at a dealer's homepage and it FINDS the inventory pages itself — no
// hand-guessed URLs. Two classic, free, almost-universally-supported signals do the work:
//   • /robots.txt    → `Sitemap:` directives (where the site PUBLISHES its own URL map)
//   • /sitemap.xml    → the URL map itself (handles sitemap-index → nested sitemaps, one level deep)
// We then rank the URLs by how listing-like the path is (inventory/used-cars/vdp… in, blog/about/parts
// out) so the crawler spends its budget on pages that actually hold vehicles. Best-effort throughout —
// any fetch failure just yields fewer URLs, never throws. Pure parsers are exported + unit-tested.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

/** Pull `Sitemap:` directive URLs out of a robots.txt body. */
export function parseRobotsSitemaps(robotsTxt: string): string[] {
  const out: string[] = [];
  for (const line of (robotsTxt || "").split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) out.push(m[1].trim());
  }
  return Array.from(new Set(out));
}

/**
 * Parse a sitemap XML. Returns page URLs (`<urlset>`) and/or child sitemap URLs (`<sitemapindex>`).
 * We don't need a full XML parser — `<loc>` is the only field that matters, and the root tag tells us
 * which bucket the locs belong in.
 */
export function parseSitemap(xml: string): {
  urls: string[];
  sitemaps: string[];
} {
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    locs.push(m[1].replace(/&amp;/g, "&").trim());
  }
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

// Path tokens that signal a vehicle inventory / listing page vs. the rest of a dealer site.
const INVENTORY_RE =
  /\b(inventory|vehicles?|cars?|trucks?|suvs?|for-?sale|used-?cars?|pre-?owned|preowned|listings?|vdp|srp|stock|showroom|autos?)\b/i;
const EXCLUDE_RE =
  /\b(blog|news|about|contact|privacy|terms|career|service|parts|finance|insurance|directions|staff|reviews?|testimonial|warranty|sitemap|feed|wp-|login|account|cart)\b|\.(jpe?g|png|gif|webp|svg|css|js|pdf|xml|ico)$/i;
const DETAIL_RE = /\b(19[5-9]\d|20[0-4]\d)\b|[A-HJ-NPR-Z0-9]{17}/; // a year or a VIN ⇒ a detail page

/** Score a URL by how inventory-like it is. >0 keep, higher first; ≤0 drop. */
export function scoreInventoryUrl(url: string): number {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return 0;
  }
  if (EXCLUDE_RE.test(path)) return 0;
  let score = 0;
  if (INVENTORY_RE.test(path)) score += 3;
  if (DETAIL_RE.test(path)) score += 1; // individual VDP (year/vin in the slug)
  return score;
}

async function safeText(fetchImpl: FetchLike, url: string): Promise<string> {
  try {
    const res = await fetchImpl(url);
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

/**
 * Discover candidate inventory/listing URLs for a dealer site, ranked best-first.
 * @param opts.maxSitemaps cap on sitemap docs fetched (incl. nested). @param opts.limit cap on results.
 */
export async function discoverListingUrls(
  siteUrl: string,
  opts: { fetchImpl?: FetchLike; maxSitemaps?: number; limit?: number } = {},
): Promise<string[]> {
  const fetchImpl =
    opts.fetchImpl ||
    ((url: string) =>
      fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      }));
  const maxSitemaps = opts.maxSitemaps ?? 10;
  const limit = opts.limit ?? 200;

  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return [];
  }

  // 1) robots.txt → declared sitemaps (fall back to the conventional /sitemap.xml).
  const robots = await safeText(fetchImpl, `${origin}/robots.txt`);
  let sitemapQueue = parseRobotsSitemaps(robots);
  if (sitemapQueue.length === 0) sitemapQueue = [`${origin}/sitemap.xml`];

  // 2) Walk sitemaps (index → children, one level), collecting page URLs. Bounded.
  const pageUrls = new Set<string>();
  const seenSitemaps = new Set<string>();
  let budget = maxSitemaps;
  while (sitemapQueue.length && budget > 0) {
    const sm = sitemapQueue.shift()!;
    if (seenSitemaps.has(sm)) continue;
    seenSitemaps.add(sm);
    budget--;
    const xml = await safeText(fetchImpl, sm);
    if (!xml) continue;
    const { urls, sitemaps } = parseSitemap(xml);
    for (const u of urls) pageUrls.add(u);
    for (const child of sitemaps)
      if (!seenSitemaps.has(child)) sitemapQueue.push(child);
  }

  // 3) Rank by inventory-likeness, keep only positive scores, best first.
  return Array.from(pageUrls)
    .map((u) => ({ u, s: scoreInventoryUrl(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.u);
}
