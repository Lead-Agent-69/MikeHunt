// lib/scrapers/sources/ebay-sold.ts
// Completed-listing price observations, not independently verified settlements.
// Hidden accepted offers and ambiguous prices cannot be treated as sold-price evidence.

import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSoldItemCache, saveSoldItemCache } from "./local-sold-cache";
import { getLocalWriteContext } from "../local-write-context";
import { normalizeModel } from "../../scoring/market-value";
import { US_STATES } from "../../geo/us-states";
import { isPartsCarSoldHeadline } from "../../deals/title-category";

const execFileAsync = promisify(execFile);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

// Headlines that are NOT a whole car: a part, a parted-out car, a shell. Always dropped.
const NOT_A_CAR_RX =
  /\b(?:parting[\s-]+out|part[\s-]+out|(?:engine|motor|transmission|trans|body|shell|frame|cab)[\s-]+only|no[\s-]+(?:engine|motor|transmission)|shell[\s-]+only|rolling[\s-]+chassis|(?:owner'?s?|service|shop|repair)[\s-]+manual|brochure|key[\s-]+fob)\b/i;
// Component words. A headline with one of these is a part listing UNLESS it also reads as a whole
// car (WHOLE_CAR_RX) or a car sold for parts ("for parts", "parts car": kept, classified Salvage).
const PART_ITEM_RX =
  /\b(?:parts?|engine|motor|transmission|hood|doors?|bumpers?|fenders?|seats?|axle|differential|ecu|ecm|pcm|module|mirrors?|headlights?|taillights?|tail[\s-]+lights?|grille|core[\s-]+support|tailgate|gauge|cluster|harness|hub[\s-]?caps?|emblem|wheels?|rims?|tires?|tyres?)\b/i;
const WHOLE_CAR_RX =
  /\b(?:\d[\d,]{2,}\s*(?:miles|mi)|miles|title[d]?|vin|runs|drives|driving|sedan|coupe|hatchback|wagon|convertible|pickup|truck|suv|minivan|van|crew[\s-]?cab|super[\s-]?crew|super[\s-]?cab|quad[\s-]?cab|double[\s-]?cab|extended[\s-]?cab|4x4|4x2|4wd|awd|2wd|fwd|rwd|automatic|one[\s-]+owner|no[\s-]+reserve)\b/i;

/**
 * True when a sold headline is a part or parted-out car, not a whole car. Whole cars sold for parts
 * ("2012 Civic for parts or repair", "2014 F-150 4x4 parts truck") are kept: soldTitleCategory
 * files them as Salvage (parts only), so they never pool with clean sales. A component word with
 * a whole-car cue ("2015 F-150 XLT 4x4 new tires") is a car, not a part.
 */
export function isPartsListingHeadline(title: string): boolean {
  if (NOT_A_CAR_RX.test(title)) return true;
  if (isPartsCarSoldHeadline(title)) return false;
  return PART_ITEM_RX.test(title) && !WHOLE_CAR_RX.test(title);
}

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
  /^(?:[-|/,:;~*!]+|no|reserve|clean|salvage|rebuilt|rebuildable|repairable|reconstructed|flood|flooded|hail|lemon|junk|for|parts|project|needs|title|low|miles?|one|owner|runs|drives|loaded|nice|must|see|warranty|financing|cold|ac|w\/|with)$/i;
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
  item_id: string;
  source_url: string;
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
    if (isPartsListingHeadline(title)) return; // drop parts, parted-out cars and shells

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

// eBay bot-walls the sold SRP and fingerprints the HTTP client — Node's fetch (undici) and even a
// stealth browser get challenged, but the system `curl` passes (and it's present in CI). So we fetch
// via curl with a shared cookie jar seeded from the homepage.
async function curlGet(
  url: string,
  jar: string,
): Promise<{ html: string; status: number }> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sL",
      "-m",
      "35",
      "-A",
      UA,
      "-b",
      jar,
      "-c",
      jar,
      "-H",
      "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "-H",
      "Accept-Language: en-US,en;q=0.9",
      "-H",
      "Referer: https://www.ebay.com/",
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
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
  const jar = join(tmpdir(), `ebsold_${process.pid}.jar`);
  // Warm-up: seed cookies from the homepage.
  try {
    await execFileAsync("curl", [
      "-s",
      "-m",
      "15",
      "-A",
      UA,
      "-c",
      jar,
      "https://www.ebay.com/",
      "-o",
      "/dev/null",
    ]);
  } catch {
    /* warm-up best-effort */
  }

  // Static popular flips + the top models actually in inventory, deduped, so anchoring reaches the cars
  // users really see (not just 15 hardcoded models).
  const sb = admin();
  const dynamic = await dynamicQueries(sb);
  const queries = Array.from(new Set([...QUERIES, ...dynamic]));
  console.log(
    `[eBay Sold] ${queries.length} queries (${QUERIES.length} static + ${dynamic.length} from live inventory)`,
  );

  const all = new Map<string, SoldRow>();
  for (const q of queries) {
    try {
      const url =
        `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}` +
        `&_sacat=6001&LH_Sold=1&LH_Complete=1&_ipg=120`;
      const { html, status } = await curlGet(url, jar);
      const blocked =
        status === 403 ||
        status === 429 ||
        /captcha|robot check|just a moment|verify you(?:'| a)re human|access denied/i.test(
          html.slice(0, 20_000),
        );
      if (blocked) {
        const context = getLocalWriteContext();
        if (context?.respectAccessBlocks) {
          context.onAccessBarrier?.({
            host: "www.ebay.com",
            status,
            reason: status ? `HTTP ${status}` : "access barrier detected",
          });
          console.warn(
            "[eBay Sold] access barrier detected; stopping this source for the cycle",
          );
          break;
        }
      }
      const parsed = parseEbaySoldHtml(html);
      for (const r of parsed) all.set(r.item_id, r);
      await new Promise((r) => setTimeout(r, 1500)); // be polite
    } catch (e) {
      console.warn(`[eBay Sold] "${q}" failed:`, (e as Error).message);
    }
  }

  const rows = Array.from(all.values());
  if (!rows.length) {
    console.log("[eBay Sold] No sold rows parsed");
    return 0;
  }

  // Sold rows are immutable market observations. The mounted local cache avoids repeat Supabase
  // writes; the unique database index remains the cross-machine source of truth.
  const seen = await loadSoldItemCache();
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
    console.log(
      `[eBay Sold] cache-only mode saved ${fresh.length} local observations; no Supabase writes`,
    );
    return 0;
  }

  if (fresh.length) {
    const insertRows = fresh.map((r) => ({
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
    }));
    const { data: inserted, error } = await sb
      .from("sold_listings")
      .upsert(insertRows, {
        onConflict: "source,source_item_id",
        ignoreDuplicates: true,
      })
      .select("source_item_id");
    if (error) {
      console.warn("[eBay Sold] insert error:", error.message);
      return 0;
    }
    for (const row of fresh) seen.add(row.item_id);
    await saveSoldItemCache(seen);
    console.log(
      `[eBay Sold] parsed ${rows.length} completed listings; inserted ${inserted?.length ?? 0} new sales`,
    );
    return inserted?.length ?? 0;
  }

  console.log(
    `[eBay Sold] parsed ${rows.length} completed listings; ${rows.length} already known locally`,
  );
  return 0;
}
