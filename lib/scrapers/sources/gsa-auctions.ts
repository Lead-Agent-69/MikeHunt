// lib/scrapers/sources/gsa-auctions.ts
// GSA Auctions (gsaauctions.gov) — U.S. FEDERAL surplus: GSA fleet sedans/SUVs/trucks, clean-title and
// well-maintained = high-quality flip leads. The site is a token-walled SPA, BUT its search backend
// (ppms.gov) answers the public browse ANONYMOUSLY — no JWT, no cookies (captured + verified by
// Antigravity in docs/findings/gsa-auctions-api.md, then confirmed live from our IP: 72 vehicle lots).
// Vehicles = categoryCodeList ["300"]. No login, no paid proxy.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";

const API =
  "https://www.ppms.gov/gw/auction/ppms/api/v1/auctions?sort=auctionEndDateSoon,DESC";
const IMG_BASE = "https://gsa-prod-ppms-attachments-prod.s3.amazonaws.com";

interface GsaLot {
  lotId?: number;
  auctionId?: number;
  lotNumber?: number;
  salesNumber?: string;
  status?: string;
  endDate?: string;
  minBid?: number;
  currentBid?: number;
  numberOfBidders?: number;
  categoryCode?: string;
  location?: { zipCode?: string; city?: string; state?: string };
  uri?: string;
  lotName?: string;
}

/** Map one GSA auction lot to a Deal. Null for non-vehicles / unusable rows. */
export function gsaLotToDeal(lot: GsaLot): Partial<Deal> | null {
  const { lotId, auctionId } = lot;
  if (lotId == null) return null;

  const name = (lot.lotName || "").trim();
  const ym = name.match(/\b(19[5-9]\d|20[0-4]\d)\b/); // model year => a real titled vehicle
  if (!ym) return null;
  const year = parseInt(ym[0], 10);

  // currentBid is the live high bid; fall back to the opening (min) bid.
  const price = Math.round(Number(lot.currentBid ?? lot.minBid ?? 0));
  if (!price || price < 1) return null;

  const after = name
    .slice((ym.index || 0) + 4)
    .trim()
    .replace(/[.;,]+$/, "")
    .split(/\s+/)
    .filter(Boolean);
  const make = after[0] || "";
  const model = after.slice(1, 3).join(" ");

  return {
    source: "gov_auction",
    source_deal_id: `gsa-${lotId}`,
    source_url: `https://www.gsaauctions.gov/auctions/auction-item/${auctionId ?? ""}/${lotId}`,
    title: name,
    year,
    make,
    model,
    ask_price: price,
    condition: "run_drive", // federal fleet; generally maintained
    location_city: lot.location?.city?.trim() || undefined,
    location_state: lot.location?.state?.trim() || undefined,
    location_zip: lot.location?.zipCode?.trim() || undefined,
    seller_type: "auction",
    seller: "GSA Auctions (federal surplus)",
    bid_count:
      typeof lot.numberOfBidders === "number" ? lot.numberOfBidders : undefined,
    auction_end: lot.endDate || undefined,
    images: lot.uri ? [`${IMG_BASE}/${lot.uri}`] : [],
    metadata: {
      auction: true,
      channel: "gov_surplus",
      marketplace: "gsa",
      salesNumber: lot.salesNumber,
      lotNumber: lot.lotNumber,
    },
    scraped_at: new Date().toISOString(),
  };
}

/** Parse a GSA auctions API response into vehicle deals. */
export function parseGsaAuctions(json: any): Partial<Deal>[] {
  const list: GsaLot[] = json?.auctionDTOList || [];
  const out: Partial<Deal>[] = [];
  for (const lot of list) {
    const d = gsaLotToDeal(lot);
    if (d) out.push(d);
  }
  return out;
}

function body(page: number, size: number) {
  return {
    categoryCodeList: ["300"], // 300 = Vehicles
    unCheckedCategoryList: [],
    auctionSearchTypeAdvanced: "ALL_WORDS",
    advancedSearchText: "",
    zipCode: "",
    radius: "",
    auctionType: "",
    minPrice: "",
    maxPrice: "",
    saleNumber: "",
    bidDeposit: null,
    states: [],
    auctionEndDateFrom: "",
    auctionEndDateTo: "",
    auctionStatus: "active",
    params: { page, size, sort: "auctionEndDateSoon,DESC" },
  };
}

export async function scrapeGsaAuctions(maxPages = 6): Promise<number> {
  console.log("[GSA] Starting scrape...");
  const SIZE = 50;
  const byId = new Map<string, Partial<Deal>>();

  for (let page = 1; page <= maxPages; page++) {
    let json: any;
    try {
      const res = await fetch(`${API}&page=${page}&size=${SIZE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Origin: "https://www.gsaauctions.gov",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        body: JSON.stringify(body(page, SIZE)),
      });
      if (!res.ok) break;
      json = await res.json();
    } catch (e) {
      console.warn(`[GSA] page ${page} failed:`, (e as Error).message);
      break;
    }
    const items = parseGsaAuctions(json);
    for (const d of items) byId.set(d.source_deal_id!, d);

    const totalPages = Number(json?.totalPages) || 1;
    if (page >= totalPages || (json?.auctionDTOList || []).length < SIZE) break;
    await new Promise((r) => setTimeout(r, 700));
  }

  const deals = Array.from(byId.values());
  console.log(`[GSA] Found ${deals.length} vehicle auctions`);
  if (deals.length > 0) await upsertDeals(deals);
  return deals.length;
}
