// lib/scrapers/sources/ebay-sold.ts
// Completed-listing price observations, not independently verified settlements.
// Hidden accepted offers and ambiguous prices cannot be treated as sold-price evidence.

import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  loadSoldItemCache,
  saveSoldItemCache,
  soldCacheScope,
} from "./local-sold-cache";
import { getLocalWriteContext } from "../local-write-context";
import { politeUserAgent } from "../polite/identity";
import { normalizeModel } from "../../scoring/market-value";
import { US_STATES } from "../../geo/us-states";

const execFileAsync = promisify(execFile);

// Honest identity only (Ren, scraper honesty rules): the MikeHunt bot user agent, no forged Referer, no
// cookie warm-up, and never a retry from another IP or machine after a block.
const UA = () => politeUserAgent();

// The models dealers actually flip — captures sold prices across mainstream + truck/SUV demand.
const QUERIES = [
  "ford f150",
  "chevrolet silverado",
  "ram 1500",
  "gmc sierra",
  "toyota tacoma",
  "toyota camry",
  "toyota corolla",
  "honda accord",
  "honda civic",
  "jeep wrangler",
  "nissan altima",
  "ford mustang",
  "ford explorer",
  "chevrolet equinox",
  "subaru outback",
];

// Sold-price anchoring only helps a car if we have sold comps for THAT make/model. The static list above
// covers the popular flips, but the live inventory spans ~hundreds of models (Acura MDX, Corvette, …) that
// had ZERO sold coverage → their valuations fell back to inflated asking-price comps. So we additionally
// derive the top make/model pairs actually present in the active `deals` table and scrape sold prices for
// those too, so coverage tracks real inventory. Returns "make model" search strings (model = first token,
// which matches eBay best for the common single-word models).
async function dynamicQueries(
  sb: SupabaseClient,
  limit = 60,
): Promise<string[]> {
  const counts = new Map<string, number>();
  const PAGE = 1000;
  try {
    for (let off = 0; off < 24000; off += PAGE) {
      const { data, error } = await sb
        .from("deals")
        .select("make, model")
        .eq("active", true)
        .gt("ask_price", 0)
        .order("id", { ascending: true })
        .range(off, off + PAGE - 1);
      if (error || !data?.length) break;
      for (const d of data as { make: string; model: string }[]) {
        const mk = (d.make || "").trim().toLowerCase();
        const md = (d.model || "")
          .trim()
          .toLowerCase()
          .split(/[\s,/]+/)[0]; // first token of the model
        if (mk.length > 1 && md.length > 1)
          counts.set(`${mk} ${md}`, (counts.get(`${mk} ${md}`) || 0) + 1);
      }
      if (data.length < PAGE) break;
    }
  } catch {
    /* fall back to the static list */
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

// Titles that are clearly NOT a whole sellable car — parts, project shells, etc.
const PARTS_RX =
  /\b(parts?|engine|transmission|motor only|hood|doors?|bumpers?|fenders?|seats?|wheels?|rims?|tires?|tyres?|axle|differential|ecu|ecm|module|mirrors?|headlights?|taillights?|grille|core support|parting out|for parts|no engine|shell only|gauge|cluster|harness|manual|brochure|hub ?cap|emblem|key fob)\b/i;

const num = (t: unknown): number =>
  Number(String(t ?? "").replace(/[^0-9.]/g, "")) || 0;

/** Listing title only. Never a photo. Capped so the sold row stays thin. */
export function shortSoldTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 160);
}

// Make spellings eBay sellers use that the deals table spells one way.
const MAKE_ALIASES: Record<string, string> = {
  chevy: "Chevrolet",
  vw: "Volkswagen",
  mercedes: "Mercedes-Benz",
  "mercedes-benz": "Mercedes-Benz",
};
// Two-word makes: the second word belongs to the make, not the model.
const TWO_WORD_MAKES = new Set(["land rover", "alfa romeo", "aston martin"]);
// Models that are two words on the deals side ("Grand Cherokee", "Model 3", "Range Rover").
const TWO_WORD_MODELS = new Set([
  "grand cherokee",
  "grand caravan",
  "grand marquis",
  "grand prix",
  "grand am",
  "grand vitara",
  "santa fe",
  "santa cruz",
  "range rover",
  "model 3",
  "model s",
  "model x",
  "model y",
  "monte carlo",
  "town country",
  "crown victoria",
  "land cruiser",
  "el camino",
  "new beetle",
  "transit connect",
  "e series",
]);
// Truck series that are part of the model on the deals side ("Silverado 1500", "Ram 2500").
const SERIES_RX = /^(?:1500|2500|3500|4500|5500|150|250|350|450|550)(?:hd)?$/i;
const SERIES_MODELS = new Set(["silverado", "sierra", "ram"]);
// Words that end the trim: listing chatter, title words and separators, not trim.
const TRIM_STOP_RX =
  /^(?:[-|/,:;~*!]+|no|reserve|clean|salvage|rebuilt|title|low|miles?|one|owner|runs|drives|loaded|nice|must|see|warranty|financing|cold|ac|w\/|with)$/i;
const MAX_TRIM_WORDS = 4;

/**
 * Split the words after the model year into make, model and trim. The model is stored through
 * market-value's normalizeModel ("F-150 XLT" -> model "f150", trim "XLT") so make|model joins match
 * the deals side exactly; the words after the model (up to listing chatter) are the trim.
 */
export function splitSoldMakeModelTrim(words: string[]): {
  make?: string;
  model?: string;
  trim?: string;
} {
  const w = words
    .map((t) => t.replace(/^[,;:()]+|[,;:()]+$/g, ""))
    .filter((t) => t && t !== "&");
  if (!w.length) return {};
  let i = 1;
  let make = MAKE_ALIASES[w[0].toLowerCase()] || w[0];
  if (TWO_WORD_MAKES.has(`${w[0]} ${w[1] || ""}`.toLowerCase())) {
    make = `${w[0]} ${w[1]}`;
    i = 2;
  }
  const a = w[i];
  if (!a) return { make };
  const b = w[i + 1];
  const pair = `${a} ${b || ""}`.toLowerCase();
  const twoWordModel =
    !!b &&
    ((/^[a-z]$/i.test(a) && /^\d{2,4}$/.test(b)) || // "F 150" -> f150
      TWO_WORD_MODELS.has(pair) || // "Grand Cherokee", "Model 3"
      (SERIES_MODELS.has(a.toLowerCase()) && SERIES_RX.test(b))); // "Silverado 1500"
  const modelWords = twoWordModel ? [a, b as string] : [a];
  const trimWords: string[] = [];
  for (const t of w.slice(i + modelWords.length)) {
    if (TRIM_STOP_RX.test(t) || /^\d{4}$/.test(t)) break;
    trimWords.push(t);
    if (trimWords.length >= MAX_TRIM_WORDS) break;
  }
  return {
    make,
    model: normalizeModel(modelWords.join(" ")) || undefined,
    trim: trimWords.join(" ").trim() || undefined,
  };
}

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([code, [name]]) => [name.toLowerCase(), code]),
);

function stateFromPlace(place: string): string | undefined {
  const parts = place
    .split(",")
    .map((p) => p.trim().replace(/\s+\d{5}(?:-\d{4})?$/, ""))
    .filter(Boolean);
  if (
    parts.length &&
    /^(?:united states(?: of america)?|usa|us)$/i.test(parts[parts.length - 1])
  )
    parts.pop();
  const last = parts[parts.length - 1];
  if (!last) return undefined;
  if (/^[A-Z]{2}$/.test(last) && US_STATES[last]) return last;
  return STATE_NAME_TO_CODE[last.toLowerCase()];
}

/**
 * Item location state from an eBay card's text pieces: "Located in Houston, TX", "Located in Texas,
 * United States", or a piece that is exactly "Dallas, TX 75201". Only an explicit US state is
 * returned; "Located in United States", a bare city or another country is undefined. Never guessed.
 */
export function parseSoldLocationState(pieces: string[]): string | undefined {
  for (const raw of pieces) {
    const text = (raw || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const located = text.match(
      /^(?:located in|item location:?|location:)\s+(.{2,80})$/i,
    );
    if (located) {
      const st = stateFromPlace(located[1]);
      if (st) return st;
      continue;
    }
    if (/^[A-Za-z .'-]{2,40},\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(text)) {
      const st = stateFromPlace(text);
      if (st) return st;
    }
  }
  return undefined;
}

export interface SoldRow {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  sold_price: number;
  sold_at?: string;
  /** Short listing title, including salvage wording when the sale is branded. */
  title?: string;
  source: string;
  location_state?: string;
  /** City from the card's explicit "Located in City, ST" line only. Never guessed. */
  location_city?: string;
  /** eBay item condition as shown on the card (used / certified / new / for_parts). */
  condition?: SoldCondition;
  /** Title brand stated in the title or subtitle (clean / salvage / rebuilt / flood / lemon). */
  title_status?: SoldTitleStatus;
  item_id: string;
  source_url: string;
}

export type SoldCondition = "used" | "certified" | "new" | "for_parts";
export type SoldTitleStatus =
  | "clean"
  | "salvage"
  | "rebuilt"
  | "flood"
  | "lemon";

/**
 * Item condition from the card subtitle ("Pre-Owned", "Used", "Certified Pre-Owned", "New",
 * "For parts or not working"). Only what the card states; undefined otherwise.
 */
export function soldConditionFrom(text: string): SoldCondition | undefined {
  const t = (text || "").toLowerCase();
  if (/for parts|not working/.test(t)) return "for_parts";
  if (/certified/.test(t)) return "certified";
  if (/pre-?owned|\bused\b/.test(t)) return "used";
  if (/\bnew\b/.test(t)) return "new";
  return undefined;
}

/**
 * Title brand stated on the card (title or subtitle). Branded words win over "clean": a "clean
 * rebuilt title" is rebuilt. Undefined when the card says nothing about the title.
 */
export function soldTitleStatusFrom(text: string): SoldTitleStatus | undefined {
  const t = (text || "").toLowerCase();
  if (/\bflood(?:ed)?\b|water damage/.test(t)) return "flood";
  if (/\bsalvage(?:d)?\b/.test(t)) return "salvage";
  if (/\brebuil(?:t|d)\b|\breconstructed\b/.test(t)) return "rebuilt";
  if (/lemon|buy ?back/.test(t)) return "lemon";
  if (/\b(?:clean|clear)\s+(?:\w+\s+)?title\b/.test(t)) return "clean";
  return undefined;
}

/**
 * City from an explicit "Located in City, ST" piece. "Located in Texas, United States" or "Located in
 * United States" have no city and give undefined.
 */
export function parseSoldLocationCity(pieces: string[]): string | undefined {
  for (const raw of pieces) {
    const text = (raw || "").replace(/\s+/g, " ").trim();
    const m = text.match(
      /^(?:located in|item location:?|location:)\s+([A-Za-z .'-]{2,40}),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*(?:united states|usa|us))?$/i,
    );
    if (m && US_STATES[m[2].toUpperCase()]) return m[1].trim();
  }
  return undefined;
}

/**
 * Why a fetched page is not a results page: an HTTP ban signal, eBay's edge "Error Page", or a bot
 * challenge. Null when the page looks like a normal results page. A barrier is a "no" from eBay: the
 * run stops and records it. Nothing here tries to get past it.
 */
export function ebaySoldBarrier(status: number, html: string): string | null {
  if (status === 403 || status === 429 || status === 503)
    return `HTTP ${status}`;
  const head = String(html || "").slice(0, 20_000);
  if (/<title>\s*Error Page \| eBay/i.test(head)) return "eBay error page";
  if (
    /captcha|robot check|just a moment|verify you(?:'| a)re human|access denied|pardon our interruption|splashui\/challenge/i.test(
      head,
    )
  )
    return "bot challenge page";
  if (status !== 0 && (status < 200 || status >= 300)) return `HTTP ${status}`;
  return null;
}

/** Parse explicit USD sold-listing observations, excluding hidden accepted offers. */
export function parseEbaySoldHtml(html: string): SoldRow[] {
  const $ = cheerio.load(html);
  const rows: SoldRow[] = [];
  const seen = new Set<string>();

  $(".s-card, li.su-card-container").each((_: number, el: any) => {
    const card = $(el);
    const title = card
      .find(".s-card__title")
      .first()
      .text()
      .trim()
      .replace(/^(new listing|sponsored|top rated plus)\s*/i, "")
      .replace(/opens in a new window.*$/i, "")
      .trim();
    if (!title || /shop on ebay/i.test(title)) return;
    if (PARTS_RX.test(title)) return; // drop parts/project junk

    const ym = title.match(/(19[5-9]\d|20[0-4]\d)/);
    if (!ym) return;
    const year = parseInt(ym[0], 10);

    if (/best offer|or best|accepted offer/i.test(card.text())) return;
    const priceText = card.find(".s-card__price").first().text().trim();
    if (!/^(?:US\s*)?\$\s*\d[\d,]*(?:\.\d{2})?$/.test(priceText)) return;
    const sold_price = num(priceText);
    if (!sold_price || sold_price < 1000 || sold_price > 300000) return;

    const link =
      card.find("a.s-card__link").attr("href") ||
      card.find('a[href*="/itm/"]').first().attr("href") ||
      "";
    let absoluteLink: string;
    try {
      const url = new URL(link, "https://www.ebay.com");
      if (
        url.protocol !== "https:" ||
        !/^(?:www\.)?ebay\.com$/.test(url.hostname)
      )
        return;
      absoluteLink = url.toString();
    } catch {
      return;
    }
    const item_id = absoluteLink.match(/\/itm\/(\d+)/)?.[1] || "";
    if (!item_id || seen.has(item_id)) return;

    // "Sold Apr 28, 2026" caption → ISO date.
    const sm = card.text().match(/Sold\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/);
    let sold_at: string | undefined;
    if (sm) {
      const d = new Date(sm[1]);
      if (!isNaN(d.getTime())) sold_at = d.toISOString();
    }
    if (!sold_at) return;
    seen.add(item_id);

    const subtitle = card
      .find(".s-card__subtitle, .su-card-container__attributes")
      .text();
    // Require ≥3 digits directly before miles/mi, in a sane range, and not just the model year.
    const miMatch = subtitle.match(/(\d[\d,]{2,})\s*(?:miles|mi)\b/i);
    let mileage: number | undefined;
    if (miMatch) {
      const m = num(miMatch[1]);
      if (m >= 500 && m <= 500000 && m !== year) mileage = m;
    }

    const after = title
      .slice((ym.index || 0) + 4)
      .trim()
      .split(/\s+/);
    const { make, model, trim } = splitSoldMakeModelTrim(after);
    // Leaf text pieces of the card (title excluded) for the location line.
    const pieces = card
      .find("*")
      .filter((_i: number, n: any) => $(n).children().length === 0)
      .not(card.find(".s-card__title *, .s-card__title"))
      .map((_i: number, n: any) => $(n).text())
      .get() as string[];
    const location_state = parseSoldLocationState(pieces);
    const location_city = location_state
      ? parseSoldLocationCity(pieces)
      : undefined;
    const condition = soldConditionFrom(subtitle);
    const title_status = soldTitleStatusFrom(`${title} ${subtitle}`);

    rows.push({
      year,
      make,
      model,
      trim,
      mileage,
      sold_price,
      sold_at,
      title: shortSoldTitle(title),
      source: "ebay_motors",
      location_state,
      location_city,
      condition,
      title_status,
      item_id,
      source_url: absoluteLink.split("?")[0],
    });
  });

  return rows;
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

/** Hard caps on one sold-search fetch: https only, few redirects, bounded body and time. */
export const EBAY_SOLD_MAX_BYTES = 8 * 1024 * 1024;

/** curl argv for one sold-search page: honest UA, no cookies, no Referer, https only, size-capped. */
export function ebaySoldCurlArgs(url: string): string[] {
  return [
    "-sL",
    "-m",
    "35",
    "--proto",
    "=https",
    "--proto-redir",
    "=https",
    "--max-redirs",
    "3",
    "--max-filesize",
    String(EBAY_SOLD_MAX_BYTES),
    "-A",
    UA(),
    "-H",
    "Accept: text/html,application/xhtml+xml",
    "-w",
    "\n__HTTP_STATUS__:%{http_code}",
    url,
  ];
}

// Fetched with the system curl (present on Zeus and in CI) under our own bot identity. If eBay refuses,
// that is the answer: the run is recorded as challenged and nothing retries from another IP or machine.
async function curlGet(url: string): Promise<{ html: string; status: number }> {
  const { stdout } = await execFileAsync("curl", ebaySoldCurlArgs(url), {
    maxBuffer: EBAY_SOLD_MAX_BYTES + 64 * 1024,
  });
  const marker = stdout.lastIndexOf("\n__HTTP_STATUS__:");
  if (marker < 0) return { html: stdout, status: 0 };
  return {
    html: stdout.slice(0, marker),
    status:
      Number(stdout.slice(marker + "\n__HTTP_STATUS__:".length).trim()) || 0,
  };
}

export async function scrapeEbaySold(): Promise<number> {
  console.log("[eBay Sold] Starting real-sold-price scrape...");
  // Static popular flips + the top models actually in inventory, deduped, so anchoring reaches the cars
  // users really see (not just 15 hardcoded models).
  const sb = admin();
  const dynamic = await dynamicQueries(sb);
  const queries = Array.from(new Set([...QUERIES, ...dynamic]));
  console.log(
    `[eBay Sold] ${queries.length} queries (${QUERIES.length} static + ${dynamic.length} from live inventory)`,
  );

  const maxQueries = Math.max(
    1,
    Number(process.env.EBAY_SOLD_MAX_QUERIES) || DEFAULT_MAX_QUERIES,
  );
  const all = new Map<string, SoldRow>();
  let barrier: { status: number; reason: string } | null = null;
  let failures = 0;
  for (const q of queries.slice(0, maxQueries)) {
    try {
      const url =
        `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}` +
        `&_sacat=6001&LH_Sold=1&LH_Complete=1&_ipg=120`;
      const { html, status } = await curlGet(url);
      const reason = ebaySoldBarrier(status, html);
      if (reason) {
        // A ban signal or challenge is a "no" from eBay. Stop the whole source for this run (with or
        // without the Zeus local context) and record it; never keep requesting the next query.
        barrier = { status, reason };
        getLocalWriteContext()?.onAccessBarrier?.({
          host: "www.ebay.com",
          status,
          reason,
        });
        console.warn(
          `[eBay Sold] challenged (${reason}) on query "${q}"; stopping this source for the run`,
        );
        break;
      }
      failures = 0;
      const parsed = parseEbaySoldHtml(html);
      for (const r of parsed) all.set(r.item_id, r);
    } catch (e) {
      failures += 1;
      console.warn(`[eBay Sold] "${q}" failed:`, (e as Error).message);
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        barrier = {
          status: 0,
          reason: `${failures} network failures in a row`,
        };
        break;
      }
      // Exponential backoff before the next query after a network failure.
      await sleep(soldDelayMs() * 2 ** failures);
      continue;
    }
    await sleep(soldDelayMs());
  }

  const rows = Array.from(all.values());
  if (!rows.length) {
    if (barrier) {
      // Recorded as a failed run (scraper_runs.status='error'), never "success, 0 rows".
      throw new Error(
        `challenged: www.ebay.com ${barrier.reason}; 0 sold rows (no bypass attempted)`,
      );
    }
    console.log("[eBay Sold] No sold rows parsed");
    return 0;
  }

  // Sold rows are immutable market observations. The mounted local cache avoids repeat Supabase
  // writes; the unique database index remains the cross-machine source of truth. The cache is kept
  // per Supabase project, so ids written to a local or staging database never hide them from hosted.
  const cacheScope = soldCacheScope(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const seen = await loadSoldItemCache(cacheScope);
  const fresh = rows.filter((r) => !seen.has(r.item_id));

  const localContext = getLocalWriteContext();
  if (localContext?.cacheOnly) {
    await localContext.cache.rememberOnly(
      "ebay_sold",
      fresh.map((row) => ({
        id: row.item_id,
        value: row as unknown as Record<string, unknown>,
      })),
    );
    console.warn(
      `[eBay Sold] CACHE_ONLY_MODE: kept ${fresh.length} sold observations locally; 0 written to Supabase`,
    );
    if (barrier) throw challengedAfterPartial(barrier.reason, rows.length, 0);
    return 0;
  }

  if (fresh.length) {
    const inserted = await writeSoldRows(sb, fresh);
    for (const row of fresh) seen.add(row.item_id);
    await saveSoldItemCache(seen, cacheScope);
    console.log(
      `[eBay Sold] parsed ${rows.length} completed listings; inserted ${inserted} new sales${barrier ? ` (stopped early: ${barrier.reason})` : ""}`,
    );
    // Rows that came through are kept, but a block mid-run is still a block: record it as challenged.
    if (barrier)
      throw challengedAfterPartial(barrier.reason, rows.length, inserted);
    return inserted;
  }

  console.log(
    `[eBay Sold] parsed ${rows.length} completed listings; ${rows.length} already known locally`,
  );
  if (barrier) throw challengedAfterPartial(barrier.reason, rows.length, 0);
  return 0;
}

/** Error for a run eBay blocked after some pages came through (rows already stored are kept). */
export function challengedAfterPartial(
  reason: string,
  parsed: number,
  inserted: number,
): Error {
  return new Error(
    `challenged: www.ebay.com ${reason} after ${parsed} sold rows parsed (${inserted} new stored); stopped, no bypass attempted`,
  );
}

const DEFAULT_MAX_QUERIES = 40;
const MAX_CONSECUTIVE_FAILURES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Floor for EBAY_SOLD_DELAY_MS: an env typo can't push requests closer than 4s (+ jitter). */
export const EBAY_SOLD_MIN_DELAY_MS = 4000;

/** Randomized gap between sold-search requests: EBAY_SOLD_DELAY_MS (default 5s) plus up to 50% jitter. */
export function soldDelayMs(random = Math.random): number {
  const base = Math.max(
    EBAY_SOLD_MIN_DELAY_MS,
    Number(process.env.EBAY_SOLD_DELAY_MS) || 5000,
  );
  return Math.round(base + base * 0.5 * random());
}

/** Source credit stored with each eBay sold row (sold_listings.attribution). */
export const EBAY_SOLD_ATTRIBUTION = "eBay completed listing (ebay.com)";

/** Map a parsed row to a sold_listings insert row (basis 'sold', sale_channel 'ebay'). */
export function soldInsertRow(r: SoldRow) {
  return {
    vin: r.vin ?? null,
    year: r.year ?? null,
    make: r.make ?? null,
    model: r.model ?? null,
    trim: r.trim ?? null,
    mileage: r.mileage ?? null,
    sold_price: r.sold_price,
    sold_at: r.sold_at ?? null,
    title: r.title ? shortSoldTitle(r.title) : null,
    source: r.source,
    source_item_id: r.item_id,
    source_url: r.source_url,
    currency_code: "USD",
    country_code: "US",
    location_state: r.location_state ?? null,
    basis: "sold",
    sale_channel: "ebay",
    // #316's sold_listings_gov_attribution requires a credit on every row with a sale_channel.
    attribution: EBAY_SOLD_ATTRIBUTION,
    location_city: r.location_city ?? null,
    condition: r.condition ?? null,
    title_status: r.title_status ?? null,
  };
}

/** Columns added by 20261010500000 (and sale_channel / attribution by 20261010410000). */
export const SOLD_DETAIL_COLUMNS = [
  "sale_channel",
  "attribution",
  "location_city",
  "condition",
  "title_status",
] as const;

/** PostgREST / Postgres "that column does not exist" (the detail migration is not applied yet). */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /could not find the '[a-z_]+' column|column "?[a-z_]+"? (?:of relation "sold_listings" )?does not exist/i.test(
      error.message || "",
    )
  );
}

/**
 * Upsert sold rows. Before 20261010500000 is applied the detail columns don't exist, so the batch is
 * retried once without them (price, date, model, mileage, state and URL still land). Any other write
 * error throws, so the run is recorded as failed instead of "success, 0 rows".
 */
export async function writeSoldRows(
  sb: SupabaseClient,
  rows: SoldRow[],
): Promise<number> {
  const full = rows.map(soldInsertRow);
  const upsert = (payload: Record<string, unknown>[]) =>
    sb
      .from("sold_listings")
      .upsert(payload, {
        onConflict: "source,source_item_id",
        ignoreDuplicates: true,
      })
      .select("source_item_id");
  let { data, error } = await upsert(full);
  if (error && isMissingColumnError(error)) {
    console.warn(
      `[eBay Sold] sold_listings detail columns missing (migration 20261010500000 not applied): ${error.message}; storing without them`,
    );
    const legacy = full.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      for (const c of SOLD_DETAIL_COLUMNS) delete copy[c];
      return copy;
    });
    ({ data, error } = await upsert(legacy));
  }
  if (error) throw new Error(`sold_listings write failed: ${error.message}`);
  return data?.length ?? 0;
}
