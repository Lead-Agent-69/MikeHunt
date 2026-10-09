// Ranking helpers for Discover "For You" and Top Flips.
// Scope match uses the saved buyerScope (segment + title), not a title-substring of "suvs".
// Transport re-rank swaps the cost already stored on the deal for the buyer's home state.
// It does not invent a per-mile rate and does not rewrite the displayed dollar.

import { milesBetweenStates, transportCostForMiles } from "@/lib/geo";
import {
  isLuxury,
  segmentOf,
  titleClass,
  type Segment,
  type TitleClass,
} from "@/lib/discovery/categorize";

export type BuyerScopePrefs = {
  buyerMode?: string | null;
  vehicle?: string | null;
  vehicleType?: string | null;
  titleType?: string | null;
  timeline?: string | null;
  repairCapability?: string | null;
  includeRepairable?: boolean;
  maxPrice?: number | null;
};

type Rankable = {
  make?: string | null;
  model?: string | null;
  title?: string | null;
  year?: number | string | null;
  trim?: string | null;
  condition?: string | null;
  damage_type?: string | null;
  damageType?: string | null;
  location_city?: string | null;
  locationCity?: string | null;
  location_state?: string | null;
  locationState?: string | null;
  segment?: string | null;
  titleClass?: string | null;
  luxury?: boolean;
  lane?: string | null;
  askPrice?: number | null;
  trueNetProfit?: number | null;
  transportEstimate?: number | null;
  profitScore?: number | null;
  grade?: string | null;
  lastSeenAt?: string | null;
  auctionEndAt?: string | null;
};

const TOKEN_SEGMENT: Record<string, Segment | "luxury"> = {
  suv: "suv",
  suvs: "suv",
  truck: "truck",
  trucks: "truck",
  sedan: "sedan",
  sedans: "sedan",
  coupe: "coupe",
  coupes: "coupe",
  convertible: "convertible",
  convertibles: "convertible",
  van: "van",
  vans: "van",
  ev: "ev",
  hybrid: "ev",
  luxury: "luxury",
};

export function hasVehicleCategoryQuery(query: string): boolean {
  return query
    .toLowerCase()
    .split(/\s+/)
    .some((term) => !!TOKEN_SEGMENT[term]);
}

function normalizeVehiclePhrase(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wantedVehicleSegment(scope: {
  vehicle?: string | null;
  vehicleType?: string | null;
}): Segment | "luxury" | null {
  const raw = normalizeVehiclePhrase(scope.vehicleType || scope.vehicle);
  if (!raw || raw === "any" || raw === "all" || raw === "any vehicle")
    return null;
  return TOKEN_SEGMENT[raw] ?? null;
}

function dealSegment(row: Rankable): Segment {
  if (row.segment && row.segment !== "other") return row.segment as Segment;
  return segmentOf(row.make, row.model);
}

function dealTitle(row: Rankable): TitleClass {
  if (row.titleClass) return row.titleClass as TitleClass;
  return titleClass(row.condition);
}

/** Vehicle-type tokens match segmentOf / luxury, not a substring of the title. */
export function rowMatchesBuyerQuery(row: Rankable, q: string): boolean {
  if (!q) return true;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const text: string[] = [];
  const wanted = new Set<Segment | "luxury">();
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (term === "hybrid" && terms[i + 1] === "ev") {
      wanted.add("ev");
      i++;
      continue;
    }
    const seg = TOKEN_SEGMENT[term];
    if (seg) {
      wanted.add(seg);
      continue;
    }
    // These are buyer-intent words, not title text. Don't require them as a substring.
    if (term === "performance" || term === "diesel") continue;
    text.push(term);
  }
  if (
    wanted.size &&
    !Array.from(wanted).some((segment) =>
      segment === "luxury"
        ? isLuxury(row.make, row.model) || row.luxury
        : dealSegment(row) === segment,
    )
  ) {
    return false;
  }
  if (!text.length) return true;
  const haystack = [
    row.title,
    row.year,
    row.make,
    row.model,
    row.trim,
    row.condition,
    row.damage_type,
    row.damageType,
    row.location_city,
    row.locationCity,
    row.location_state,
    row.locationState,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.every((term) => haystack.includes(term));
}

export function titleScopeMatches(
  row: Rankable,
  titleType?: string | null,
): boolean {
  const want = (titleType || "").toLowerCase();
  if (!want || want === "all") return true;
  const tc = dealTitle(row);
  if (want === "clean") return tc === "clean";
  if (want === "salvage")
    return (
      tc === "salvage" ||
      tc === "rebuilt" ||
      tc === "parts" ||
      row.lane === "salvage" ||
      row.lane === "repairable"
    );
  return tc === want;
}

export function scopeMatchScore(
  row: Rankable,
  scope: BuyerScopePrefs,
  makes: string[] = [],
  homeState?: string | null,
): number {
  let score = 0;
  const want = wantedVehicleSegment(scope);
  if (want === "luxury") {
    if (isLuxury(row.make, row.model) || row.luxury) score += 2;
  } else if (want && dealSegment(row) === want) {
    score += 2;
  }
  if (
    scope.titleType &&
    scope.titleType !== "all" &&
    titleScopeMatches(row, scope.titleType)
  ) {
    score += 2;
  }
  const home = (homeState || "").trim().toUpperCase();
  const listing = String(row.locationState || row.location_state || "")
    .trim()
    .toUpperCase();
  if (home && home !== "NATIONWIDE" && listing === home) score += 1;
  if (makes.length && makes.includes((row.make || "").toLowerCase()))
    score += 2;
  const max = Number(scope.maxPrice) || 0;
  if (max > 0 && Number(row.askPrice) > 0 && Number(row.askPrice) <= max)
    score += 1;
  return score;
}

export function dropsForNoRepair(
  row: Rankable,
  repairCapability?: string | null,
): boolean {
  if (repairCapability !== "none") return false;
  return row.lane === "salvage" || row.lane === "repairable";
}

/**
 * Stored profit with the buyer's tow swapped in.
 * Missing home or listing state keeps the stored profit. Does not mutate the deal.
 */
export function transportAdjustedProfit(
  row: Rankable,
  homeState?: string | null,
): number | null {
  if (row.trueNetProfit == null || !Number.isFinite(Number(row.trueNetProfit)))
    return null;
  const stored = Number(row.trueNetProfit);
  const home = (homeState || "").trim().toUpperCase();
  const listing = String(row.locationState || row.location_state || "")
    .trim()
    .toUpperCase();
  if (!home || home === "NATIONWIDE" || !listing) return stored;
  const miles = milesBetweenStates(listing, home);
  if (miles == null) return stored;
  if (
    row.transportEstimate == null ||
    !Number.isFinite(Number(row.transportEstimate))
  )
    return stored;
  return stored + Number(row.transportEstimate) - transportCostForMiles(miles);
}

const GRADE_RANK: Record<string, number> = {
  great: 3,
  good: 2,
  fair: 1,
  high: 0,
  unknown: -1,
};

function auctionSoonKey(row: Rankable, now: number): number {
  const end = Date.parse(row.auctionEndAt || "");
  if (!Number.isFinite(end) || end <= now) return Number.POSITIVE_INFINITY;
  return end;
}

function seenKey(row: Rankable): number {
  const t = Date.parse(row.lastSeenAt || "");
  return Number.isFinite(t) ? t : 0;
}

/** Personal buyers: scope match, then recency. Timeline "now" prefers a stored auction end. */
export function comparePersonal(
  a: Rankable,
  b: Rankable,
  scope: BuyerScopePrefs,
  makes: string[] = [],
  homeState?: string | null,
  now = Date.now(),
): number {
  const byScope =
    scopeMatchScore(b, scope, makes, homeState) -
    scopeMatchScore(a, scope, makes, homeState);
  if (byScope) return byScope;
  if (scope.timeline === "now") {
    const byAuction = auctionSoonKey(a, now) - auctionSoonKey(b, now);
    if (byAuction) return byAuction;
  }
  return seenKey(b) - seenKey(a);
}

export function compareFlip(
  a: Rankable,
  b: Rankable,
  homeState?: string | null,
): number {
  if (homeState) {
    const pa = transportAdjustedProfit(a, homeState);
    const pb = transportAdjustedProfit(b, homeState);
    if (pa != null || pb != null) {
      const byProfit =
        (pb ?? Number.NEGATIVE_INFINITY) - (pa ?? Number.NEGATIVE_INFINITY);
      if (byProfit) return byProfit;
    }
  }
  return (b.profitScore || 0) - (a.profitScore || 0);
}

export function isFlipMode(buyerMode?: string | null): boolean {
  return buyerMode === "reseller" || buyerMode === "dealer";
}

export { GRADE_RANK };
