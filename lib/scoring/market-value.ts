// lib/scoring/market-value.ts
// $0 market valuation built from our OWN multi-channel scraped data — the only free path,
// since every real vehicle-value API (MarketCheck/KBB/Edmunds/Black Book) is paid.
//
// We scrape both RETAIL channels (Cars.com, eBay, CarGurus, AutoTrader, Carvana…) and
// WHOLESALE/PRIVATE channels (Copart, IAA, Craigslist, Facebook…). The retail median is the
// resale target; the wholesale/private median is the acquisition benchmark. The gap between
// them is the real arbitrage signal — and it sharpens automatically as coverage grows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateBaselineValue } from "./baseline-value";
import { looksLikePlaceholderPrice } from "./placeholder-price";
import { looksLikePaymentPrice } from "./payment-price";

const RETAIL_SOURCES = new Set([
  "cars_com",
  "ebay_motors",
  "cargurus",
  "autotrader",
  "carvana",
  "truecar",
  "vroom",
  "carmax",
  "craigslist_dealer", // CL by-dealer section — real dealer asking prices ($0, unblocked)
]);
// Everything else (copart, iaa, manheim, adesa, acv, craigslist, facebook_marketplace,
// offerup, independent_dealer, gsa…) is treated as wholesale/private acquisition supply.

// Ask-to-sold haircut: listing asks run above actual transaction prices.
const ASK_TO_SOLD = 0.95;
// Minimum comps before we trust the figure.
const MIN_SAMPLES = 3;
const TTL_MS = 10 * 60 * 1000;

// Width of the year band used for grouping comps. Backtest-tuned: a 2-year band beats both 3 (too
// loose — blends a 2021 and 2023) and 1/exact-year (too thin — fewer comps/bucket, noisier). Measured
// out-of-sample on held-out retail: band 3 → 11.8% MAPE, band 2 → 11.0%, band 1 → 11.3%. 2 wins.
const YEAR_BAND = 2;
// Payment/lease "prices" are NOT cash market value — a "$2,500 down" or "$399/mo" listing is a
// financing teaser whose number runs far from the real cash price. Excluding these from the retail
// comp median keeps it anchored to true cash value (financed deals price HIGH/teaser, not market).
// Note: a plain "we finance" mention is NOT excluded — a legit dealer can list a real cash price and
// also offer financing; only payment-denominated numbers are dropped.
// Salvage/parts/rebuilt conditions that must NOT pollute the clean-retail resale bucket.
const SALVAGE_CONDITIONS = [
  "salvage",
  "parts",
  "rebuilt",
  "repairable",
  "flood",
  "junk",
  "non-runner",
  "wrecked",
];

export interface MarketComps {
  retail: number | null; // estimated resale value (ask-to-sold adjusted)
  wholesale: number | null; // typical acquisition price on auction/private channels
  nRetail: number;
  nWholesale: number;
  // Median mileage of the retail comps behind `retail`. The anchor that makes valuation
  // mileage-aware: a target is adjusted by ITS miles vs the actual comp pool's miles, not a guess.
  mileageMed?: number | null;
  // Confidence in the retail figure, derived from sample count, so callers can tell
  // a thin (2-3 comp) estimate from a deep (50+ comp) one.
  confidence: "high" | "medium" | "low" | "none";
  // The statistical LOWER outlier fence (Tukey q1 − 1.5·IQR) of the ask comps — the price below which a
  // listing is a genuine outlier for THIS specific market. Adapts per make/model (a tight Corolla bucket
  // vs a wide Silverado one) instead of a fixed ratio, so the analyzer can flag "priced below anything this
  // vehicle actually sells for" with no keywords. Null when there aren't enough comps to be meaningful.
  retailLowFence?: number | null;
}

let computed: Map<string, MarketComps> | null = null;
// Trim-level index (make|model|year|trim) — the sharper PRIMARY tier; `computed` is the fallback.
let computedTrim: Map<string, MarketComps> | null = null;
let loadedAt = 0;
let loadingPromise: Promise<void> | null = null;

// Real demand proxy: how many active listings exist nationally for a make|model right now. Built
// from the same loaded deals (no extra query), keyed make|model across all years. Feeds the
// analyzer's demand/competition signal so scoring reflects ACTUAL supply scarcity instead of a
// hardcoded body-type guess. Few listings = scarce = moves faster; flooded = more competition.
let supplyByModel: Map<string, number> | null = null;

// Retail comps tagged with their year, keyed make|model (no year band). Powers a year-adjusted
// fallback tier: when a deal's exact year-band bucket is thin, we age-adjust same-model comps from
// other years (via the baseline depreciation curve) so it still gets a REAL number instead of the
// pure offline baseline. ~90% of make/model/year buckets are otherwise too thin for direct comps.
let retailByModel: Map<string, { year: number; price: number }[]> | null = null;
// Real completed-sale prices (eBay sold etc.) keyed make|model|yearBucket.
// Clean and salvage are separate. A missing title is neither. Below n = 3 we do not invent a sold.
let soldIndex: Map<string, SoldMedian> | null = null;
let soldByState: Map<string, SoldMedian> | null = null;
let salvageSoldIndex: Map<string, SoldMedian> | null = null;
let salvageSoldByState: Map<string, SoldMedian> | null = null;

const modelKey = (make?: string | null, model?: string | null) =>
  `${(make || "").toLowerCase().trim()}|${normalizeModel(model)}`;

export function __resetMarketIndexForTest() {
  computed = null;
  computedTrim = null;
  supplyByModel = null;
  retailByModel = null;
  soldIndex = null;
  soldByState = null;
  salvageSoldIndex = null;
  salvageSoldByState = null;
  loadedAt = 0;
  loadingPromise = null;
}

/** Normalize a model string so 'f-150', 'f150', 'F 150' all collapse to one token. */
function normalizeModel(model?: string | null): string {
  return (model || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "") // drop spaces/dashes: 'f-150' -> 'f150', 'grand cherokee' -> 'grandcherokee'
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Group a year into a fixed band so nearby model-years share comps. */
function yearBucket(year?: number | null): string {
  if (!year || year < 1900) return "na";
  return String(Math.floor(year / YEAR_BAND) * YEAR_BAND);
}

function key(
  make?: string | null,
  model?: string | null,
  year?: number | null,
): string {
  return `${(make || "").toLowerCase().trim()}|${normalizeModel(model)}|${yearBucket(year)}`;
}

// Trim-level bucket key = model key + normalized trim. Backtested: bucketing by trim cuts prediction
// error ~30% (model-level 15.5% MAPE → trim-level 10.9% on Ford/Chevy/BMW/Toyota) because a base trim no
// longer shares a median with a Z06/Raptor. Used as the PRIMARY tier when its bucket is deep enough; the
// model-level bucket remains the fallback so thin-trim cars keep full coverage.
function normalizeTrim(trim?: string | null): string {
  return (trim || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function trimKey(
  make?: string | null,
  model?: string | null,
  year?: number | null,
  trim?: string | null,
): string {
  return `${key(make, model, year)}|${normalizeTrim(trim)}`;
}

// Confidence in a comp bucket. Count sets the base tier, then DISPERSION downgrades it: a bucket with a
// wide price spread is blending distinct sub-populations (a base trim + a Z06/Raptor, or clean + rough
// condition), so its median is a blur of two markets, not one dependable value. We measure spread with the
// quartile coefficient of dispersion (IQR/median — robust, ignores the extremes the median already trims).
// Conservative by design: this only ever LOWERS confidence, so a mixed bucket gets pulled toward the
// trim-aware baseline instead of asserting a false, contaminated number.
function confidenceFor(
  n: number,
  prices?: number[],
): MarketComps["confidence"] {
  let tier = n >= 12 ? 3 : n >= 6 ? 2 : n >= MIN_SAMPLES ? 1 : 0; // 3 high · 2 med · 1 low · 0 none
  if (prices && prices.length >= 6 && tier >= 2) {
    const s = [...prices].sort((a, b) => a - b);
    const med = s[Math.floor(s.length / 2)];
    const q1 = s[Math.floor(s.length * 0.25)];
    const q3 = s[Math.floor(s.length * 0.75)];
    const qcd = med > 0 ? (q3 - q1) / med : 0;
    if (qcd > 0.5)
      tier -= 2; // very bimodal (mixed trims) → two tiers down
    else if (qcd > 0.32) tier -= 1; // meaningfully mixed → one tier down
  }
  return tier >= 3 ? "high" : tier >= 2 ? "medium" : tier >= 1 ? "low" : "none";
}

// Tukey lower outlier fence (q1 − 1.5·IQR) of a price set — the adaptive, per-market "below this is an
// outlier" line. Null under 6 comps (too thin to trust a spread) or when the fence lands ≤0 (a very wide
// bucket where nothing is a low outlier). Computed on RAW ask comps so a listing's ask compares like-for-like.
export function lowFence(prices: number[]): number | null {
  if (prices.length < 6) return null;
  const s = [...prices].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const fence = q1 - 1.5 * (q3 - q1);
  return fence > 0 ? Math.round(fence) : null;
}

function median(prices: number[]): number | null {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  if (sorted.length < 4) return sorted[Math.floor(sorted.length / 2)];

  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;

  // Aggressive outlier removal: 1.5× IQR (standard) but also enforce a max ratio
  // to prevent extreme outliers (e.g. Shelby GT500 at $42k in a $5k Mustang bucket).
  // Any price more than 3× the Q3 is rejected as an extreme outlier.
  const maxPrice = Math.max(q3 * 3, q3 + 1.5 * iqr);
  const minPrice = Math.max(0, q1 - 1.5 * iqr);

  const clean = sorted.filter((p) => p >= minPrice && p <= maxPrice);

  // Fall back to raw median if filtering removes too much
  const use = clean.length >= Math.ceil(sorted.length * 0.5) ? clean : sorted;
  return use[Math.floor(use.length / 2)];
}

/**
 * Load/refresh the in-memory market index from `deals`. Cached for TTL_MS so a full scrape
 * run only pays for it once. Call before scoring a batch.
 */
export async function loadMarketIndex(
  supabase: SupabaseClient,
  force = false,
): Promise<void> {
  if (computed && !force && Date.now() - loadedAt < TTL_MS) return;
  if (loadingPromise && !force) {
    await loadingPromise;
    return;
  }

  loadingPromise = loadMarketIndexUnlocked(supabase, force).finally(() => {
    loadingPromise = null;
  });
  await loadingPromise;
}

async function loadMarketIndexUnlocked(
  supabase: SupabaseClient,
  force = false,
): Promise<void> {
  if (computed && !force && Date.now() - loadedAt < TTL_MS) return;

  // PostgREST caps a single response at ~1000 rows, so .limit(50000) silently returned only 1000 —
  // the comp index saw 1/6 of inventory. Paginate to load all active comps.
  const PAGE = 1000;
  const MAX = 60000;
  const data: any[] = [];
  let loadErr: { message: string } | null = null;
  for (let from = 0; from < MAX; from += PAGE) {
    const { data: pageRows, error } = await supabase
      .from("deals")
      .select(
        "make, model, year, trim, mileage, source, ask_price, condition, damage_type, title",
      )
      .eq("active", true) // only live inventory feeds comps — don't price off dead stock
      .gt("ask_price", 1000)
      .lt("ask_price", 200000)
      .range(from, from + PAGE - 1);
    if (error) {
      loadErr = error;
      break;
    }
    if (!pageRows || pageRows.length === 0) break;
    data.push(...pageRows);
    if (pageRows.length < PAGE) break;
  }

  if (loadErr && data.length === 0) {
    console.warn("[market-value] index load failed:", loadErr.message);
    if (!computed) computed = new Map();
    return;
  }

  type Bucket = {
    retail: number[];
    wholesale: number[];
    retailMiles: number[];
  };
  const buckets = new Map<string, Bucket>();
  const trimBuckets = new Map<string, Bucket>(); // parallel trim-level index
  const supply = new Map<string, number>();
  const byModel = new Map<string, { year: number; price: number }[]>();
  for (const r of data || []) {
    const k = key(r.make, r.model, r.year);
    // Require make + model present (year may be 'na'); skip empty rows.
    if (!(r.make && r.model)) continue;
    // Keep placeholder/bait prices ($1,234, $1, $111,111) OUT of the comp index so they can't poison
    // the medians every valuation depends on. The listing still exists/shows — just not as a comp.
    if (looksLikePlaceholderPrice(r.ask_price)) continue;
    // Tally national supply per make|model (all years) for the demand-scarcity signal.
    const sk = `${(r.make || "").toLowerCase().trim()}|${normalizeModel(r.model)}`;
    supply.set(sk, (supply.get(sk) || 0) + 1);
    if (!buckets.has(k))
      buckets.set(k, { retail: [], wholesale: [], retailMiles: [] });
    const b = buckets.get(k)!;
    if (RETAIL_SOURCES.has(r.source)) {
      // Clean-retail only: drop salvage/parts/rebuilt rows so resale comps aren't polluted.
      const cond = (r.condition || "").toLowerCase();
      const dmg = (r.damage_type || "").toLowerCase();
      const isSalvage =
        SALVAGE_CONDITIONS.some((s) => cond.includes(s)) ||
        (dmg !== "" && dmg !== "none");
      // Drop financing/lease teaser prices so the cash-market median isn't inflated/distorted.
      const isPaymentPrice = looksLikePaymentPrice(r.title);
      if (!isSalvage && !isPaymentPrice) {
        b.retail.push(r.ask_price);
        if (typeof r.mileage === "number" && r.mileage > 0)
          b.retailMiles.push(r.mileage);
        if (r.year && r.year > 1950) {
          if (!byModel.has(sk)) byModel.set(sk, []);
          byModel.get(sk)!.push({ year: r.year, price: r.ask_price });
        }
        // Feed the sharper trim-level index too (when the row has a trim).
        if (normalizeTrim(r.trim)) {
          const tk = trimKey(r.make, r.model, r.year, r.trim);
          let tb = trimBuckets.get(tk);
          if (!tb) {
            tb = { retail: [], wholesale: [], retailMiles: [] };
            trimBuckets.set(tk, tb);
          }
          tb.retail.push(r.ask_price);
          if (typeof r.mileage === "number" && r.mileage > 0)
            tb.retailMiles.push(r.mileage);
        }
      }
    } else {
      b.wholesale.push(r.ask_price);
    }
  }

  const nowYear = new Date().getFullYear();
  // Turn a raw bucket into its MarketComps figure (median + age-aware ask→sold haircut + dispersion-aware
  // confidence). Shared by the model-level and trim-level indexes — year is field [2] of both keys.
  const computeBucket = (b: Bucket, k: string): MarketComps => {
    const retailMed = median(b.retail);
    const milesMed = median(b.retailMiles);
    const bucketYear = parseInt(k.split("|")[2], 10);
    const yrAge = Number.isFinite(bucketYear)
      ? Math.max(0, nowYear - bucketYear)
      : 0;
    const haircut = yrAge >= 18 ? 0.84 : yrAge >= 11 ? 0.89 : ASK_TO_SOLD;
    return {
      retail: retailMed != null ? Math.round(retailMed * haircut) : null,
      wholesale: median(b.wholesale),
      nRetail: b.retail.length,
      nWholesale: b.wholesale.length,
      mileageMed: milesMed != null ? Math.round(milesMed) : null,
      confidence: confidenceFor(b.retail.length, b.retail),
      retailLowFence: lowFence(b.retail),
    };
  };
  const next = new Map<string, MarketComps>();
  buckets.forEach((b, k) => next.set(k, computeBucket(b, k)));
  const nextTrim = new Map<string, MarketComps>();
  trimBuckets.forEach((b, k) => nextTrim.set(k, computeBucket(b, k)));
  computed = next;
  computedTrim = nextTrim;
  supplyByModel = supply;
  retailByModel = byModel;
  loadedAt = Date.now();
  console.log(
    `[market-value] index: ${next.size} make/model/year groups from ${(data || []).length} comps`,
  );

  // Build the REAL-SOLD index from completed-sale prices (eBay sold etc.) — the truth anchor used to
  // value damaged/budget cars. Best-effort; never blocks scoring.
  await loadSoldIndex(supabase);
}

const SALVAGE_SOLD_TITLE =
  /\b(salvage|rebuilt|rebuild|repairable|flood(?:ed)?|junk|non-?runner|wreck(?:ed)?|branded title|title brand|for parts|parts only|certificate of destruction|\bcod\b)\b/i;

export type SoldTitleLane = "clean" | "salvage" | "unknown";

/** Salvage/rebuilt/flood wording on the stored title. Blank titles are unknown, not clean. */
export function soldTitleLane(title?: string | null): SoldTitleLane {
  const text = (title || "").replace(/\s+/g, " ").trim();
  if (!text) return "unknown";
  return SALVAGE_SOLD_TITLE.test(text) ? "salvage" : "clean";
}

export type SoldObservation = {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  sold_price?: number | null;
  location_state?: string | null;
  title?: string | null;
  sold_at?: string | null;
};

type SoldBucket = { prices: number[]; soldAt: string | null };

/**
 * Completed sales older than this do not count toward a sold median. Used-vehicle prices move
 * month to month, so a price from years back is not "what it sells for" today. 180 days is wide
 * enough to reach n >= 3 for common make/model/year bands and short enough to stay current.
 * Rows with no sold date, or a date in the future, are left out too: their age is unknown.
 */
export const SOLD_MEDIAN_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;
/** Allow a little clock skew between the scraper and this server before calling a date "future". */
const SOLD_FUTURE_SKEW_MS = DAY_MS;

/** ISO cutoff for queries: sales on or after this instant are inside the window. */
export function soldWindowCutoffIso(now: number = Date.now()): string {
  return new Date(now - SOLD_MEDIAN_WINDOW_DAYS * DAY_MS).toISOString();
}

/** Is this sale date inside the sold-median window? Missing or unparseable dates are not. */
export function isWithinSoldWindow(
  soldAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!soldAt) return false;
  const t = Date.parse(soldAt);
  if (!Number.isFinite(t)) return false;
  if (t > now + SOLD_FUTURE_SKEW_MS) return false;
  return now - t <= SOLD_MEDIAN_WINDOW_DAYS * DAY_MS;
}

function pushSold(
  buckets: Map<string, SoldBucket>,
  bucketKey: string,
  price: number,
  soldAt?: string | null,
) {
  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = { prices: [], soldAt: null };
    buckets.set(bucketKey, bucket);
  }
  bucket.prices.push(price);
  if (soldAt && (!bucket.soldAt || soldAt > bucket.soldAt))
    bucket.soldAt = soldAt;
}

function finalizeSold(buckets: Map<string, SoldBucket>) {
  const idx = new Map<string, SoldMedian>();
  buckets.forEach((bucket, bucketKey) => {
    const value = median(bucket.prices);
    if (value == null) return;
    idx.set(bucketKey, {
      median: Math.round(value),
      n: bucket.prices.length,
      soldAt: bucket.soldAt,
    });
  });
  return idx;
}

/**
 * Split completed sales by title. Untitled rows are dropped so they cannot pose as clean, and sales
 * outside SOLD_MEDIAN_WINDOW_DAYS are dropped so an old price cannot pose as current.
 */
export function buildSoldIndexes(
  rows: SoldObservation[],
  now: number = Date.now(),
) {
  const clean = new Map<string, SoldBucket>();
  const cleanState = new Map<string, SoldBucket>();
  const salvage = new Map<string, SoldBucket>();
  const salvageState = new Map<string, SoldBucket>();
  for (const row of rows || []) {
    const price = Number(row.sold_price);
    if (!(row.make && row.model && price > 0)) continue;
    // Outside SOLD_MEDIAN_WINDOW_DAYS (or undated): not a current sold price.
    if (!isWithinSoldWindow(row.sold_at, now)) continue;
    const lane = soldTitleLane(row.title);
    if (lane === "unknown") continue;
    const national = lane === "clean" ? clean : salvage;
    const byState = lane === "clean" ? cleanState : salvageState;
    const bucketKey = key(row.make, row.model, row.year);
    pushSold(national, bucketKey, price, row.sold_at);
    const state = String(row.location_state || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(state)) {
      pushSold(byState, `${bucketKey}|${state}`, price, row.sold_at);
    }
  }
  return {
    clean: finalizeSold(clean),
    cleanState: finalizeSold(cleanState),
    salvage: finalizeSold(salvage),
    salvageState: finalizeSold(salvageState),
  };
}

export function summarizeCleanSold(
  rows: SoldObservation[],
  now: number = Date.now(),
) {
  const clean: SoldObservation[] = [];
  let salvageCount = 0;
  let unknownCount = 0;
  let staleCount = 0;
  for (const row of rows || []) {
    const price = Number(row.sold_price);
    if (!(price > 0)) continue;
    if (!isWithinSoldWindow(row.sold_at, now)) {
      staleCount += 1;
      continue;
    }
    const lane = soldTitleLane(row.title);
    if (lane === "clean") clean.push(row);
    else if (lane === "salvage") salvageCount += 1;
    else unknownCount += 1;
  }
  const prices = clean
    .map((row) => Number(row.sold_price))
    .filter((price) => price > 0)
    .sort((a, b) => a - b);
  const publish = prices.length >= 3;
  const value = publish ? median(prices) : null;
  const soldAt = publish
    ? clean
        .map((row) => row.sold_at)
        .filter((stamp): stamp is string => Boolean(stamp))
        .sort()
        .at(-1) || null
    : null;
  const note = publish
    ? null
    : salvageCount > 0
      ? `Salvage titles are not a clean price. ${prices.length} clean sale${prices.length === 1 ? "" : "s"} on file; a clean median needs at least 3.`
      : prices.length > 0
        ? `${prices.length} clean sale${prices.length === 1 ? "" : "s"} on file. A clean price needs at least 3.`
        : unknownCount > 0
          ? "Sold rows have no title, so they are not used as a clean price."
          : salvageCount > 0
            ? "Only salvage titles on file. Not a clean price."
            : staleCount > 0
              ? `No sales in the last ${SOLD_MEDIAN_WINDOW_DAYS} days. Older sales are not used as a current price.`
              : null;
  return {
    median: value == null ? null : Math.round(value),
    count: prices.length,
    soldAt,
    low: publish ? prices[0] : null,
    high: publish ? prices[prices.length - 1] : null,
    salvageCount,
    unknownCount,
    staleCount,
    windowDays: SOLD_MEDIAN_WINDOW_DAYS,
    mixed: salvageCount > 0 && prices.length < 3,
    note,
  };
}

async function loadSoldIndex(supabase: SupabaseClient): Promise<void> {
  try {
    const rows: SoldObservation[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 40000; from += PAGE) {
      const { data, error } = await supabase
        .from("sold_listings")
        .select("make, model, year, sold_price, location_state, title, sold_at")
        .eq("currency_code", "USD")
        .eq("country_code", "US")
        .gt("sold_price", 0)
        .gte("sold_at", soldWindowCutoffIso())
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    const built = buildSoldIndexes(rows);
    soldIndex = built.clean;
    soldByState = built.cleanState;
    salvageSoldIndex = built.salvage;
    salvageSoldByState = built.salvageState;
    console.log(
      `[market-value] sold index: ${built.clean.size} clean groups, ${built.salvage.size} salvage groups`,
    );
  } catch (e) {
    console.warn(
      "[market-value] sold index load failed:",
      (e as Error).message,
    );
    if (!soldIndex) soldIndex = new Map();
    if (!soldByState) soldByState = new Map();
    if (!salvageSoldIndex) salvageSoldIndex = new Map();
    if (!salvageSoldByState) salvageSoldByState = new Map();
  }
}

export type SoldMedian = { median: number; n: number; soldAt?: string | null };

/** Same-state median when that state has n >= 3, else the national band, else null. */
export function pickSoldAnchor(
  national?: SoldMedian | null,
  sameState?: SoldMedian | null,
): SoldMedian | null {
  if (sameState && sameState.n >= 3 && sameState.median > 0) return sameState;
  if (national && national.n >= 3 && national.median > 0) return national;
  return null;
}

/** Real completed-sale median for a make/model/year band (null under n = 3). */
export function lookupRealSold(
  make?: string | null,
  model?: string | null,
  year?: number | null,
  state?: string | null,
): SoldMedian | null {
  if (!soldIndex) return null;
  const national = soldIndex.get(key(make, model, year)) || null;
  const st = (state || "").trim().toUpperCase();
  const same =
    st && soldByState
      ? soldByState.get(`${key(make, model, year)}|${st}`)
      : null;
  return pickSoldAnchor(national, same);
}

/** Salvage-titled completed sales only. Never used as the clean price. */
export function lookupSalvageSold(
  make?: string | null,
  model?: string | null,
  year?: number | null,
  state?: string | null,
): SoldMedian | null {
  if (!salvageSoldIndex) return null;
  const national = salvageSoldIndex.get(key(make, model, year)) || null;
  const st = (state || "").trim().toUpperCase();
  const same =
    st && salvageSoldByState
      ? salvageSoldByState.get(`${key(make, model, year)}|${st}`)
      : null;
  return pickSoldAnchor(national, same);
}

/**
 * National active-listing count for a make|model from the loaded index — the real supply/demand
 * scarcity signal. Returns null when the index hasn't been loaded (caller falls back to its prior).
 */
export function lookupSupply(
  make?: string | null,
  model?: string | null,
): number | null {
  if (!supplyByModel) return null;
  const sk = `${(make || "").toLowerCase().trim()}|${normalizeModel(model)}`;
  return supplyByModel.get(sk) ?? 0;
}

/** Synchronous lookup from the loaded index. Returns null if not enough comparable data. */
/**
 * Year-adjusted retail comps for a make|model across ALL years: each same-model comp is aged to the
 * target year via the baseline depreciation curve, then median'd. The fallback that gives a deal a
 * REAL number when its exact year-band bucket is thin. Confidence is capped (cross-year approximation).
 */
function lookupModelAdjusted(
  make?: string | null,
  model?: string | null,
  year?: number | null,
): MarketComps | null {
  if (!retailByModel || !year || year < 1950) return null;
  const comps = retailByModel.get(modelKey(make, model));
  if (!comps || comps.length < MIN_SAMPLES) return null;
  const targetBase = estimateBaselineValue(year, make, model);
  if (targetBase <= 0) return null;

  const adjusted: number[] = [];
  for (const c of comps) {
    if (c.year === year) {
      adjusted.push(c.price); // same year — no adjustment
      continue;
    }
    const compBase = estimateBaselineValue(c.year, make, model);
    if (compBase <= 0) continue;
    const adj = c.price * (targetBase / compBase);
    if (adj > 500 && adj < 300000) adjusted.push(adj);
  }
  if (adjusted.length < MIN_SAMPLES) return null;
  const med = median(adjusted);
  if (med == null) return null;

  // Knock confidence down one notch (never above medium) since it's a cross-year approximation.
  const raw = confidenceFor(adjusted.length, adjusted);
  const capped: MarketComps["confidence"] =
    raw === "high" ? "medium" : raw === "medium" ? "low" : "low";
  return {
    retail: Math.round(med * ASK_TO_SOLD),
    wholesale: null,
    nRetail: adjusted.length,
    nWholesale: 0,
    confidence: capped,
  };
}

export function lookupMarketValue(
  make?: string | null,
  model?: string | null,
  year?: number | null,
  trim?: string | null,
): MarketComps | null {
  if (!computed) return null;
  // PRIMARY tier: the trim-level bucket when it's deep enough. Backtested ~30% more accurate (a base trim
  // no longer priced off a performance/luxury trim). Falls through to the model-level logic below when the
  // trim bucket is thin or absent, so coverage never drops.
  if (trim && computedTrim && normalizeTrim(trim)) {
    const t = computedTrim.get(trimKey(make, model, year, trim));
    if (t && t.retail != null && t.nRetail >= 6) return t;
  }
  const exact = computed.get(key(make, model, year)) || null;
  // A solid exact-bucket figure (medium+) is the most trustworthy — use it directly.
  if (exact && exact.retail != null && exact.nRetail >= 6) return exact;

  // Thin or missing exact bucket → try the year-adjusted same-model tier.
  const adj = lookupModelAdjusted(make, model, year);
  const exactUsable =
    exact && exact.retail != null && exact.nRetail >= MIN_SAMPLES
      ? exact
      : null;
  // Prefer whichever real retail figure has more support.
  if (exactUsable && (!adj || exactUsable.nRetail >= adj.nRetail))
    return exactUsable;
  if (adj) return adj;

  // Nothing trustworthy — strip an untrusted thin retail (keep any wholesale), else null.
  if (exact)
    return exact.retail != null && exact.nRetail < MIN_SAMPLES
      ? { ...exact, retail: null, confidence: "none" }
      : exact;
  return null;
}
