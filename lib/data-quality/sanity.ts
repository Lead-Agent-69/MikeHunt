// lib/data-quality/sanity.ts
// Ingest-time value sanity checks and field completeness for one listing. Pure, no I/O.
//
// A row that fails a check is FLAGGED, never dropped: it is stored with `quality_flags` naming every
// reason, and the pipeline keeps it out of scoring (no profit, score or GO) and out of valuation comps.
// Completeness (0-100) says how much of the listing we actually have, so enrichment can spend its
// budget on the rows that need it most.

import { normalizeVin, isValidVin } from "@/lib/vehicle/vin";
import { isKnownMake } from "@/lib/scrapers/tools/deal-normalizer";

export const QUALITY_FLAGS = [
  "price_below_300",
  "price_above_500k",
  "mileage_negative",
  "mileage_above_500k",
  "mileage_implausible",
  "year_before_1950",
  "year_after_next_model_year",
  "vin_bad_format",
  "vin_check_digit",
  "year_vin_mismatch",
  "make_unknown",
] as const;

export type QualityFlag = (typeof QUALITY_FLAGS)[number];

export const PRICE_MIN = 300;
export const PRICE_MAX = 500_000;
export const MILEAGE_MAX = 500_000;
export const YEAR_MIN = 1950;
/** Under this odometer reading on a car 3+ model years old is a placeholder ("0", "1", "100"). */
export const MILEAGE_PLACEHOLDER_MAX = 100;

/** Latest plausible model year: next year's models go on sale during the current calendar year. */
export function maxModelYear(now: Date = new Date()): number {
  return now.getFullYear() + 1;
}

/** Sources whose ask_price is a CURRENT BID on a live lot, not an asking price. */
export const AUCTION_BID_SOURCES = new Set([
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "acv",
  "gov_auction",
  "repo_network",
]);

/** Miles per year of age above which an odometer reading is implausible (2025 model at 400k). */
export const MILES_PER_YEAR_MAX = 150_000;

export interface SanityInput {
  ask_price?: number | null;
  mileage?: number | null;
  year?: number | null;
  vin?: string | null;
  make?: string | null;
  source?: string | null;
  auction_end_at?: string | null;
  /** Year as the listing stated it, before a VIN decode overwrote `year` (pipeline). */
  listed_year?: number | null;
}

/** A live auction lot's price is the current bid: a $100 bid is normal, not a placeholder. */
export function isAuctionBid(
  deal: Pick<SanityInput, "source" | "auction_end_at">,
): boolean {
  return (
    AUCTION_BID_SOURCES.has(String(deal.source || "").toLowerCase()) ||
    !!deal.auction_end_at
  );
}

const VIN_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/**
 * Model-year candidates from VIN position 10 (the code repeats every 30 years: A = 1980 or 2010).
 * Empty when the VIN is not a check-digit-valid 17-char VIN or the code is not a year code.
 */
export function vinModelYears(raw: string | null | undefined): number[] {
  const vin = normalizeVin(String(raw || ""));
  if (!isValidVin(vin)) return [];
  const i = VIN_YEAR_CODES.indexOf(vin[9]);
  if (i < 0) return [];
  return [1980 + i, 2010 + i];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** VIN-only checks. A 17-char VIN from 1981+ must carry a correct ISO 3779 check digit. */
export function vinFlags(raw: string | null | undefined): QualityFlag[] {
  const vin = normalizeVin(String(raw || ""));
  if (!vin) return [];
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return ["vin_bad_format"];
  return isValidVin(vin) ? [] : ["vin_check_digit"];
}

/** Every sanity reason that applies to this listing, in a stable order. Empty = clean. */
export function qualityFlags(
  deal: SanityInput,
  now: Date = new Date(),
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const price = num(deal.ask_price);
  if (price !== null && price < PRICE_MIN && !isAuctionBid(deal))
    flags.push("price_below_300");
  if (price !== null && price > PRICE_MAX) flags.push("price_above_500k");
  const miles = num(deal.mileage);
  if (miles !== null && miles < 0) flags.push("mileage_negative");
  if (miles !== null && miles > MILEAGE_MAX) flags.push("mileage_above_500k");
  const year = num(deal.year);
  if (
    miles !== null &&
    miles >= 0 &&
    miles < MILEAGE_PLACEHOLDER_MAX &&
    year !== null &&
    year > 0 &&
    now.getFullYear() - year >= 3
  )
    flags.push("mileage_implausible");
  else if (
    miles !== null &&
    year !== null &&
    year > 0 &&
    miles <= MILEAGE_MAX &&
    miles > MILES_PER_YEAR_MAX * Math.max(1, now.getFullYear() - year + 1)
  )
    flags.push("mileage_implausible");
  if (year !== null && year > 0 && year < YEAR_MIN)
    flags.push("year_before_1950");
  if (year !== null && year > maxModelYear(now))
    flags.push("year_after_next_model_year");
  // Pre-1981 cars have no standard 17-char VIN, so only judge VINs on 1981+ (or unknown-year) rows.
  if (!(year !== null && year > 0 && year < 1981))
    flags.push(...vinFlags(deal.vin));
  // Stated year vs the VIN's model-year code: off by one is normal (model year vs sale year), 2+ is not.
  const stated = num(deal.listed_year) ?? year;
  const vinYears = vinModelYears(deal.vin);
  if (
    stated !== null &&
    stated > 0 &&
    vinYears.length &&
    Math.min(...vinYears.map((y) => Math.abs(y - stated))) > 1
  )
    flags.push("year_vin_mismatch");
  // A model or trim stored as the make ("Odyssey", "F150"): flag it, never guess the make.
  if (String(deal.make || "").trim() && !isKnownMake(deal.make))
    flags.push("make_unknown");
  return flags;
}

/** True when the row must stay out of scoring and valuation. Every flag counts. */
export function isQualityFlagged(
  flags: readonly string[] | null | undefined,
): boolean {
  return Array.isArray(flags) && flags.length > 0;
}

export interface CompletenessInput {
  images?: unknown;
  vin?: string | null;
  mileage?: number | null;
  ask_price?: number | null;
  condition?: string | null;
  location_zip?: string | null;
  location_city?: string | null;
  location_state?: string | null;
}

/** Weights sum to 100. Title status is the stored `condition` (null = title unknown). */
export const COMPLETENESS_WEIGHTS = {
  photo: 25,
  vin: 20,
  mileage: 15,
  price: 15,
  titleStatus: 15,
  location: 10,
} as const;

export type CompletenessField = keyof typeof COMPLETENESS_WEIGHTS;

/** Which fields a listing is missing (location counts as missing unless zip or city+state). */
export function missingFields(deal: CompletenessInput): CompletenessField[] {
  const out: CompletenessField[] = [];
  const hasPhoto =
    Array.isArray(deal.images) &&
    deal.images.some((u) => typeof u === "string" && u.trim().length > 0);
  if (!hasPhoto) out.push("photo");
  const vin = normalizeVin(String(deal.vin || ""));
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) out.push("vin");
  const miles = num(deal.mileage);
  if (miles === null || miles < 0) out.push("mileage");
  const price = num(deal.ask_price);
  if (price === null || price <= 0) out.push("price");
  if (!String(deal.condition || "").trim()) out.push("titleStatus");
  const zip = /\b\d{5}\b/.test(String(deal.location_zip || ""));
  const cityState =
    String(deal.location_city || "").trim() &&
    String(deal.location_state || "").trim();
  if (!zip && !cityState) out.push("location");
  return out;
}

/** 0-100. A state alone (no zip, no city) earns half the location weight. */
export function completenessScore(deal: CompletenessInput): number {
  const missing = new Set(missingFields(deal));
  let score = 0;
  for (const [field, weight] of Object.entries(COMPLETENESS_WEIGHTS)) {
    if (!missing.has(field as CompletenessField)) score += weight;
  }
  if (missing.has("location") && String(deal.location_state || "").trim())
    score += COMPLETENESS_WEIGHTS.location / 2;
  return Math.round(score);
}

/**
 * Enrichment boost from completeness: the fewer fields a listing has, the more a detail-page fetch
 * is worth. Missing VIN/photo/mileage are what a detail page usually fills, so they weigh most.
 * Returns 0..30, added on top of enrichPriority's profitability heuristic.
 */
export function enrichmentNeed(deal: CompletenessInput): number {
  const missing = new Set(missingFields(deal));
  let need = 0;
  if (missing.has("vin")) need += 12;
  if (missing.has("photo")) need += 8;
  if (missing.has("mileage")) need += 7;
  if (missing.has("titleStatus")) need += 3;
  return need;
}
