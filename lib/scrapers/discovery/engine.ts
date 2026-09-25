// Auto-Discovery Engine — the "machine" that grows the salvage network on its own. Per (state × type):
//   LLM proposes real candidate sites → validate (live car-selling site? not parked/hallucinated)
//   → classify (refine type from the page) → dedup vs known → append to the registry → optionally crawl.
// Plus link-expansion: rebuilder dealers link to each other, so we mine outbound links from known sites.
// $0 beyond the AI calls we already make (gpt-4o-mini / gemini-flash). Scripts/CI only (uses fs + axios).
import { generateText } from "ai";
import { getTextModel, hasTextModel } from "@/lib/ai/text-model";
import {
  CURATED_SITES,
  autoDiscoverAndCrawl,
  SITE_TYPE_DEFAULTS,
  type CuratedSite,
  type CuratedSiteType,
} from "../sources";
import {
  readRegistry,
  appendRegistry,
  recordYield,
  domainKey,
  type DiscoveredSite,
} from "./registry";

// Salvage-moat types we actively hunt (independent/clean retail aren't the differentiator).
const HUNT_TYPES: CuratedSiteType[] = [
  "salvage_yard",
  "rebuilder_dealer",
  "auction_proxy",
];

// prettier-ignore
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

// Aggregators we already crawl directly or never want as a "discovered dealer".
const BLOCKED = /copart|iaa(?:i)?\.|insuranceauto|adesa|manheim|ebay|cars\.com|carsforsale|carvana|cargurus|facebook|craigslist|autotrader|kbb|edmunds|truecar|carfax|vroom|carmax|offerup|cargrurus|surplusrecord|machinerytrader|equipmenttrader|govdeals\.com|shopgoodwill/i;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const TYPE_LABEL: Record<CuratedSiteType, string> = {
  salvage_yard: "salvage yards / total-loss & branded-title vehicle sellers",
  rebuilder_dealer: "dealers specializing in rebuilt / repairable / rebuildable-title cars",
  auction_proxy: "salvage auction reseller / broker sites (public buys Copart/IAA lots)",
  independent_dealer: "independent used-car dealers that carry branded-title cars",
  clean_retail: "used-car dealers",
};

/** Ask the LLM for real candidate sites in a state for a given type. The intelligence layer. */
export async function generateCandidates(
  state: string,
  type: CuratedSiteType,
  count = 10,
): Promise<{ url: string; name: string }[]> {
  if (!hasTextModel()) return [];
  const prompt = `List up to ${count} REAL, currently-operating ${TYPE_LABEL[type]} in ${state}, USA that have their own website showing vehicle inventory. Return ONLY a JSON array; each item {"url":"https://rootdomain.com","name":"Business Name"}. Use the real root domain (https, no path). EXCLUDE Copart, IAA, ADESA, Manheim, eBay, Cars.com, Carvana, CarGurus, Facebook, Craigslist, AutoTrader, KBB, Edmunds, TrueCar, CarMax. Do NOT invent domains — only businesses you are confident actually exist; if unsure, return fewer. No prose, no markdown.`;
  try {
    const { text } = await generateText({
      model: getTextModel(),
      prompt,
      temperature: 0,
    });
    const a = text.indexOf("["),
      b = text.lastIndexOf("]");
    if (a < 0 || b < 0) return [];
    const arr = JSON.parse(text.slice(a, b + 1));
    return (Array.isArray(arr) ? arr : [])
      .filter((x: any) => x && typeof x.url === "string" && /^https?:\/\//.test(x.url))
      .map((x: any) => ({ url: x.url.trim(), name: String(x.name || "").trim() }))
      .filter((x: { url: string }) => !BLOCKED.test(x.url));
  } catch {
    return [];
  }
}

export type ValidateStatus = "live" | "blocked" | "dead";

/** Cheap homepage check: is this a live car-selling site (vs parked / hallucinated / not-a-dealer)? */
export async function validateSite(
  url: string,
): Promise<{ status: ValidateStatus; name?: string; html?: string }> {
  try {
    const axios = (await import("axios")).default;
    const res = await axios.get(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300 && typeof res.data === "string") {
      const html = res.data;
      const carSite =
        /inventory|vehicles?\b|for sale|salvage|rebuilt|repairable|odometer|mileage|\$\s?\d{3,}/i.test(
          html,
        );
      if (!carSite) return { status: "dead" }; // resolves but a landing/parked page
      const name = (html.match(/<title[^>]*>([^<]+)</i)?.[1] || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      return { status: "live", name, html };
    }
    // Bot walls (403/429/503) are usually REAL dealer platforms (DealerCarSearch/Overfuel) — keep them.
    if ([401, 403, 406, 429, 503].includes(res.status)) return { status: "blocked" };
    return { status: "dead" };
  } catch (e: any) {
    const code = e?.code || "";
    // NXDOMAIN / refused = hallucinated or gone → drop. Timeout/TLS = unknown → keep as unverified.
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ERR_INVALID_URL/.test(code))
      return { status: "dead" };
    return { status: "blocked" };
  }
}

/** Refine the site type from its homepage text (the LLM's guess is just a starting point). */
export function classifySite(
  html: string | undefined,
  fallback: CuratedSiteType,
): CuratedSiteType {
  if (!html) return fallback;
  const x = html.toLowerCase();
  if (
    /(copart|iaa|salvage auction).{0,40}(broker|reseller|membership|member price|buy)/.test(x) ||
    /bid on (salvage|copart|iaa)/.test(x)
  )
    return "auction_proxy";
  if (/rebuilt title|repairable|rebuildable|salvage rebuilt|prior salvage/.test(x))
    return "rebuilder_dealer";
  if (/u-?pull|pull-?a-?part|self[\s-]?service|parts? yard|junk yard|we buy junk/.test(x))
    return "salvage_yard";
  if (/salvage|flood|total[\s-]?loss|branded title|hail damage/.test(x))
    return "salvage_yard";
  return fallback;
}

/** Mine a known site's homepage for outbound links to OTHER dealer sites (the network effect). */
export function expandFromHtml(html: string, known: Set<string>): string[] {
  const out: string[] = [];
  const re = /href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]{0,60})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1];
    const text = (m[2] || "").toLowerCase();
    const key = domainKey(url);
    if (known.has(key) || BLOCKED.test(url)) continue;
    if (/auto|motor|salvage|rebuilt|repairable|cars?\b|dealer/.test(key + " " + text)) {
      known.add(key);
      out.push(`https://${key}`);
    }
  }
  return Array.from(new Set(out)).slice(0, 20);
}

function knownDomains(): Set<string> {
  const s = new Set<string>();
  for (const c of CURATED_SITES) s.add(domainKey(c.url));
  for (const d of readRegistry()) s.add(domainKey(d.url));
  return s;
}

export interface DiscoveryResult {
  proposed: number;
  added: number;
  crawled: number;
  perState: Record<string, number>;
  sample: DiscoveredSite[];
}

/** Run the discovery loop. Default: every state × hunt type. Bound with `states`/`max` for a quick pass. */
export async function runDiscovery(
  opts: {
    states?: string[];
    types?: CuratedSiteType[];
    perQuery?: number;
    crawl?: boolean;
    max?: number;
    onLog?: (msg: string) => void;
  } = {},
): Promise<DiscoveryResult> {
  const log = opts.onLog || (() => {});
  const states = opts.states ?? US_STATES;
  const types = opts.types ?? HUNT_TYPES;
  const known = knownDomains();
  const fresh: DiscoveredSite[] = [];
  let proposed = 0;

  outer: for (const state of states) {
    for (const type of types) {
      const cands = await generateCandidates(state, type, opts.perQuery ?? 10);
      proposed += cands.length;
      for (const c of cands) {
        const key = domainKey(c.url);
        if (known.has(key)) continue;
        known.add(key);
        const v = await validateSite(c.url);
        if (v.status === "dead") continue; // parked / hallucinated → skip
        const finalType = classifySite(v.html, type);
        fresh.push({
          url: `https://${key}`,
          name: c.name || v.name || key,
          state,
          type: finalType,
          status: v.status === "live" ? "live" : "unverified",
          discoveredVia: "llm",
        });
        log(`+ ${state}/${finalType} ${key} (${v.status})`);
        if (opts.max && fresh.length >= opts.max) break outer;
      }
    }
  }

  const added = appendRegistry(fresh);
  log(`registry: +${added} new sites (${fresh.length} found this run)`);

  let crawled = 0;
  if (opts.crawl) {
    for (const s of fresh) {
      const d = SITE_TYPE_DEFAULTS[s.type];
      try {
        const n = await autoDiscoverAndCrawl(s.url, {
          name: s.name,
          state: s.state,
          conditionDefault: d.condition,
          damageDefault: d.damage_type,
          sellerDefault: d.seller_type,
        });
        recordYield(s.url, n);
        crawled += n;
        log(`crawled ${domainKey(s.url)}: ${n} cars`);
      } catch {
        recordYield(s.url, 0);
      }
    }
  }

  const perState: Record<string, number> = {};
  for (const s of fresh) perState[s.state!] = (perState[s.state!] || 0) + 1;
  return { proposed, added, crawled, perState, sample: fresh.slice(0, 15) };
}

/** Crawl every site in the discovered registry (the machine's accumulated finds), recording yields so
 *  winners persist and dead ones can be retired. The CI calls this alongside scrapeCuratedSites. */
export async function scrapeDiscoveredSites(
  opts: { max?: number; onLog?: (m: string) => void } = {},
): Promise<number> {
  const log = opts.onLog || (() => {});
  const sites = readRegistry().slice(0, opts.max ?? Infinity);
  log(`crawling ${sites.length} discovered sites`);
  let total = 0;
  for (const s of sites) {
    const d = SITE_TYPE_DEFAULTS[s.type];
    try {
      const n = await autoDiscoverAndCrawl(s.url, {
        name: s.name,
        state: s.state,
        conditionDefault: d.condition,
        damageDefault: d.damage_type,
        sellerDefault: d.seller_type,
      });
      recordYield(s.url, n);
      total += n;
      log(`${domainKey(s.url)}: ${n} cars`);
    } catch {
      recordYield(s.url, 0);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return total;
}
