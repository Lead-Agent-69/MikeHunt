import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { haversineMiles } from "@/lib/geo/distance";
import { validCoords } from "@/lib/geo/buyer-home";
import { US_STATES } from "@/lib/geo/us-states";
import type { MarketValuation } from "./valuation";

export type MarketPrice = ReturnType<typeof sourcePriceContext>;
export type MarketListing = {
  id: string;
  title: string;
  source: string;
  sourceUrl?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  askPrice: number;
  buyNowPrice?: number;
  price: MarketPrice;
  images: string[];
  imageUrl?: string;
  locationCity?: string;
  locationState?: string;
  /** Rounded source coordinates for the market map; never expose the raw seller pin. */
  mapLat?: number;
  mapLng?: number;
  distanceMiles?: number;
  bodyClass?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  color?: string;
  assemblyCountry?: string;
  availabilityStatus?: string;
  condition?: string;
  damageType?: string;
  sellerType?: string;
  lane: string;
  lastSeenAt?: string;
  firstSeenAt?: string;
  auctionEndAt?: string;
  sellEstimate?: number;
  valuationEvidence?: MarketValuation;
  profitEstimate?: number;
  profitScore?: number;
  dealVerdict?: "go" | "hold" | "pass";
  recommendedMaxBid?: number;
};

export type MarketFacetCount = { value: string; n: number };
export type MarketRangeBand = {
  from: number;
  to: number | null;
  label: string;
};
export type MarketPriceMileageCell = {
  priceFrom: number;
  priceTo: number | null;
  mileageFrom: number;
  mileageTo: number | null;
  n: number;
};
export type MarketFacets = {
  states?: Record<string, number>;
  lanes?: Record<string, number>;
  sellerTypes?: Record<string, number>;
  topMakes?: { make: string; n: number }[];
  topModels?: MarketFacetCount[];
  years?: MarketFacetCount[];
  bodyClasses?: MarketFacetCount[];
  fuelTypes?: MarketFacetCount[];
  transmissions?: MarketFacetCount[];
  drivetrains?: MarketFacetCount[];
  conditions?: MarketFacetCount[];
  sources?: MarketFacetCount[];
  colors?: MarketFacetCount[];
  assemblyCountries?: MarketFacetCount[];
  availability?: MarketFacetCount[];
  freshness?: MarketFacetCount[];
  priceKinds?: MarketFacetCount[];
  priceHistogram?: { from: number; to: number; n: number }[];
  mileageHistogram?: { from: number; to: number; n: number }[];
  priceBands?: MarketRangeBand[];
  mileageBands?: MarketRangeBand[];
  priceMileageMatrix?: MarketPriceMileageCell[];
  missingPrice?: number;
  missingMileage?: number;
  mapped?: number;
  laneProfit?: Record<string, number>;
  laneColors?: Record<string, string>;
};

export function marketDistance(
  center: { lat: number; lng: number },
  row: { lat?: unknown; lng?: unknown },
) {
  const point = validCoords(row.lat, row.lng);
  return point
    ? haversineMiles(center.lat, center.lng, point.lat, point.lng)
    : null;
}

export const MARKET_PRICE_KINDS = [
  "asking",
  "current_bid",
  "buy_now",
  "down_payment",
  "monthly_payment",
  "finance_teaser",
  "reference",
  "unknown",
] as const;

/** Collapse common source spellings before faceting so one make never appears as two filters. */
export function canonicalMarketMake(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = raw
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    gm: "GMC",
    gmc: "GMC",
    chevy: "Chevrolet",
    vw: "Volkswagen",
    mercedes: "Mercedes-Benz",
    "mercedes benz": "Mercedes-Benz",
  };
  if (aliases[key]) return aliases[key];
  if (/^[a-z]{2,4}$/i.test(raw) && raw === raw.toUpperCase()) return raw;
  return raw.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseMarketLocation(params: URLSearchParams) {
  const near = (params.get("near") || params.get("zip") || "")
    .trim()
    .slice(0, 100);
  const rawRadius = params.get("radius");
  const radius =
    rawRadius == null || rawRadius === "" ? null : Number(rawRadius);
  const hasPin = params.has("lat") || params.has("lng");
  const center = hasPin
    ? validCoords(params.get("lat"), params.get("lng"))
    : null;
  if (hasPin && !center)
    return {
      error: "Choose a valid location before searching by radius.",
    } as const;
  if (
    radius != null &&
    (!Number.isFinite(radius) || radius < 1 || radius > 1000)
  )
    return { error: "Radius must be between 1 and 1,000 miles." } as const;
  if (radius != null && !near && !center)
    return {
      error:
        "Enter a ZIP code, city and state, or use your location for a radius search.",
    } as const;
  const cityState = /^(.+),\s*([A-Za-z]{2})$/.exec(near);
  if (
    near &&
    !/^\d{5}$/.test(near) &&
    (!cityState || !US_STATES[cityState[2].toUpperCase()])
  )
    return {
      error:
        "Use a five-digit ZIP code or a city and state, such as St. Louis, MO.",
    } as const;
  return {
    near,
    center,
    radius: near || center ? (radius ?? 100) : null,
    place: /^\d{5}$/.test(near)
      ? { zip: near }
      : cityState
        ? { city: cityState[1].trim(), state: cityState[2].toUpperCase() }
        : null,
  };
}

export function summarizeMarket(rows: MarketListing[], now = Date.now()) {
  const prices: number[] = [];
  const priceKinds: Record<string, number> = {};
  const sources: Record<string, number> = {};
  let withPhotos = 0,
    fresh24h = 0,
    withLocation = 0;
  for (const row of rows) {
    priceKinds[row.price.kind] = (priceKinds[row.price.kind] || 0) + 1;
    sources[row.source] = (sources[row.source] || 0) + 1;
    // Only current, comparable cash asking prices enter the asking-price distribution.
    if (row.price.canCompareToAskingCurve && row.price.cashPrice != null)
      prices.push(row.price.cashPrice);
    if (row.images.length) withPhotos++;
    if (row.locationCity && row.locationState) withLocation++;
    const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
    if (Number.isFinite(seen) && seen <= now + 300000 && seen >= now - 86400000)
      fresh24h++;
  }
  prices.sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const medianAsk = prices.length
    ? Math.round(
        prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2,
      )
    : null;
  return {
    count: rows.length,
    withPhotos,
    fresh24h,
    withLocation,
    sources,
    priceKinds,
    askingSample: prices.length,
    medianAsk,
    askingRange: prices.length
      ? { min: prices[0], max: prices[prices.length - 1] }
      : null,
    asOf: new Date(now).toISOString(),
  };
}

export type MarketSummary = ReturnType<typeof summarizeMarket>;
