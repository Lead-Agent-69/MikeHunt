// lib/scrapers/sources/gsa-official.ts
// GSA Auctions through the OFFICIAL public API (api.gsa.gov, run by api.data.gov):
//   GET https://api.gsa.gov/assets/gsaauctions/v2/auctions?api_key=KEY&format=JSON
// It 303-redirects to one JSON file of every active federal surplus lot (~1,100 lots, ~3.5 MB);
// vehicles are the lots whose name carries a model year + make.
//
// Key: GSA_API_KEY from env (api.data.gov key: 1,000 requests/hour); otherwise the shared DEMO_KEY
// (30/hour, 50/day per IP). The whole catalog is one request, so we throttle anyway: one call per
// 30 min with a real key, one per 2h on DEMO_KEY, and the last result is reused in between.
// Polite: honest bot User-Agent, Retry-After honored on 429, key sent as a header only.
//
// Used as a fallback when the existing ppms.gov browse path returns nothing, and on its own via the
// "gsa_api" runner id. Nothing here logs in, solves captchas or rotates IPs.

import type { Deal } from "@/types";
import { extractMake } from "../tools/deal-normalizer";
import { politeUserAgent } from "../polite/identity";
import { parseRetryAfterMs } from "../polite/backoff";

export const GSA_API_URL = "https://api.gsa.gov/assets/gsaauctions/v2/auctions";
export const DEMO_KEY = "DEMO_KEY";
const DEMO_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const KEY_MIN_INTERVAL_MS = 30 * 60 * 1000;

export interface GsaApiLot {
  saleNo?: string;
  lotNo?: string;
  aucStartDt?: string;
  aucEndDt?: string;
  itemName?: string;
  propertyCity?: string | null;
  propertyState?: string | null;
  propertyZip?: string | null;
  auctionStatus?: string;
  biddersCount?: number | null;
  highBidAmount?: number | null;
  reserve?: boolean;
  agencyName?: string;
  itemDescURL?: string;
  imageURL?: string;
}

export function gsaApiKey(
  env: Record<string, string | undefined> = process.env,
) {
  const key = env.GSA_API_KEY?.trim();
  return key ? { key, demo: false } : { key: DEMO_KEY, demo: true };
}

export function gsaMinIntervalMs(demo: boolean) {
  return demo ? DEMO_MIN_INTERVAL_MS : KEY_MIN_INTERVAL_MS;
}

// Things with a model year that aren't road vehicles we can value.
const NOT_A_CAR =
  /\b(cessna|aircraft|helicopter|blackhawk|vessel|boat|whaler|trailer|tractor|loader|forklift|crane|counter|machine|generator|mower|excavator|backhoe|dozer|skid ?steer|polaris|atv|utv|gator|golf cart)\b/i;

/** Map one official-API lot to a Deal. Null for non-vehicles. */
export function gsaApiLotToDeal(lot: GsaApiLot): Partial<Deal> | null {
  const name = (lot.itemName || "").replace(/\s+/g, " ").trim();
  if (!name || NOT_A_CAR.test(name)) return null;
  if (lot.auctionStatus && !/active|preview/i.test(lot.auctionStatus))
    return null;
  const ym = name.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (!ym) return null;
  const make = extractMake(name);
  if (!make) return null;
  const after = name
    .slice((ym.index || 0) + 4)
    .trim()
    .split(/\s+/);
  const makeIdx = after.findIndex((t) => extractMake(t) === make);
  const model = after
    .slice(makeIdx >= 0 ? makeIdx + 1 : 1, (makeIdx >= 0 ? makeIdx + 1 : 1) + 2)
    .join(" ")
    .replace(/[.,;]+$/, "");
  const auctionId = lot.itemDescURL?.match(/\/preview\/(\d+)/)?.[1];
  const key = auctionId || `${lot.saleNo}-${lot.lotNo}`;
  const bid = Number(lot.highBidAmount || 0);
  return {
    source: "gov_auction",
    source_deal_id: `gsa-api-${key}`,
    source_url:
      lot.itemDescURL || "https://www.gsaauctions.gov/auctions/auctions-list",
    title: name,
    year: Number(ym[1]),
    make,
    model: model || undefined,
    // No bid yet = no price. Only a real high bid is shown as the price.
    ask_price: bid > 0 ? Math.round(bid) : 0,
    condition: "run_drive",
    location_city: lot.propertyCity?.trim() || undefined,
    location_state: lot.propertyState?.trim() || undefined,
    location_zip: lot.propertyZip?.trim().slice(0, 5) || undefined,
    seller_type: "auction",
    seller: lot.agencyName
      ? `GSA Auctions (${lot.agencyName})`
      : "GSA Auctions (federal surplus)",
    bid_count:
      typeof lot.biddersCount === "number" ? lot.biddersCount : undefined,
    auction_end: lot.aucEndDt || undefined,
    images: lot.imageURL ? [lot.imageURL] : [],
    metadata: {
      auction: true,
      channel: "gov_surplus",
      marketplace: "gsa",
      via: "api.gsa.gov",
      salesNumber: lot.saleNo,
      lotNumber: lot.lotNo,
      reserve: lot.reserve ?? undefined,
    },
    scraped_at: new Date().toISOString(),
  };
}

export function parseGsaApi(json: unknown): Partial<Deal>[] {
  const list: GsaApiLot[] = Array.isArray((json as any)?.Results)
    ? (json as any).Results
    : Array.isArray(json)
      ? (json as GsaApiLot[])
      : [];
  const byId = new Map<string, Partial<Deal>>();
  for (const lot of list) {
    const d = gsaApiLotToDeal(lot);
    if (d) byId.set(d.source_deal_id!, d);
  }
  return Array.from(byId.values());
}

// Hard throttle independent of the page cache: within the interval we return the last result and
// make no request at all.
let last: { at: number; demo: boolean; deals: Partial<Deal>[] } | null = null;

export function resetGsaApiThrottle() {
  last = null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Fetch + parse the official catalog. Throttled to one network call per interval. */
export async function fetchGsaApiVehicles(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
): Promise<{
  deals: Partial<Deal>[];
  demo: boolean;
  throttled?: boolean;
  skipped?: string;
  status?: number;
}> {
  const { key, demo } = gsaApiKey(env);
  const interval = gsaMinIntervalMs(demo);
  if (last && last.demo === demo && now - last.at < interval) {
    return { deals: last.deals, demo, throttled: true };
  }
  last = { at: now, demo, deals: [] }; // count the attempt even if it fails
  const ua = { "User-Agent": politeUserAgent() };
  try {
    // 1) api.gsa.gov answers 303 with a short-lived signed link to the catalog file. The key goes in
    //    the X-Api-Key header (never in the URL, so it can't land in logs or caches), and we follow
    //    the redirect ourselves so the key is not forwarded to the file host.
    const head = await fetchImpl(`${GSA_API_URL}?format=JSON`, {
      headers: { ...ua, Accept: "application/json", "X-Api-Key": key },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (head.status === 429) {
      // Respect the rate limit: push the next attempt out by Retry-After (or the interval).
      const wait =
        parseRetryAfterMs(head.headers.get("retry-after"), now) ?? interval;
      last = { at: now + Math.max(0, wait - interval), demo, deals: [] };
      return { deals: [], demo, status: 429, skipped: "rate_limited" };
    }
    const location = head.headers.get("location");
    let body: string;
    if (head.status >= 300 && head.status < 400 && location) {
      const file = await fetchImpl(location, {
        headers: { ...ua, Accept: "application/json" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!file.ok) return { deals: [], demo, status: file.status };
      body = await file.text();
    } else if (head.ok) {
      body = await head.text();
    } else {
      return { deals: [], demo, status: head.status };
    }
    const deals = parseGsaApi(JSON.parse(body));
    last = { at: now, demo, deals };
    return { deals, demo, status: 200 };
  } catch (e) {
    return {
      deals: [],
      demo,
      skipped: (e as Error).name === "SyntaxError" ? "bad_json" : "network",
    };
  }
}
