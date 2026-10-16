import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { haversineMiles } from "@/lib/geo/distance";
import { validCoords } from "@/lib/geo/buyer-home";
import { US_STATES } from "@/lib/geo/us-states";

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
  distanceMiles?: number;
  condition?: string;
  damageType?: string;
  sellerType?: string;
  lane: string;
  lastSeenAt?: string;
  firstSeenAt?: string;
  auctionEndAt?: string;
  sellEstimate?: number;
  profitEstimate: number;
  profitScore: number;
  dealVerdict?: "go" | "hold" | "pass";
  recommendedMaxBid?: number;
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
