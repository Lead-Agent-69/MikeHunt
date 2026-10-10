// lib/scrapers/sources/publicsurplus.ts
// PublicSurplus.com — government/municipal surplus auctions, fully OPEN (no Cloudflare, no login).
// Police/fleet cars, trucks and vans sell here for a fraction of retail — prime cheap-acquisition
// leads for a flipping dealer. We browse the vehicle categories (403 Auto, 404 Truck) with GET
// pagination and parse the listing cards. Prices are the CURRENT auction bid, not asking; the
// pipeline's known-make gate naturally filters non-cars (buses/equipment) that share the category.

import { scraperFetch } from "@/lib/scrapers/polite/scraper-fetch";
import type { Deal } from "@/types";
import { isCarOrTruck } from "../vehicle-class";
import { upsertDeals } from "../pipeline";

const BASE = "https://www.publicsurplus.com/sms/browse/cataucs";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// catid 403 = Auto, 404 = Truck (verified live). Others (motorcycle/heavy equipment) are skipped.
const VEHICLE_CATS = [403, 404];

const decode = (t: string): string =>
  t
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function imageForAuction(html: string, auc: string) {
  const block = html.match(
    new RegExp(
      `auction\\/view\\?auc=${auc}[\\s\\S]{0,1800}?auction-item-state`,
      "i",
    ),
  )?.[0];
  const src = block?.match(/\bsrc="([^"]+)"/i)?.[1];
  return src?.startsWith("http") ? src.replace(/&amp;/g, "&") : undefined;
}

function auctionEndForAuction(html: string, auc: string) {
  const match = html.match(
    new RegExp(
      `updateTimeLeftSpan\\(timeLeftInfoMap,\\s*${auc},\\s*"${auc}catGrid",\\s*\\d+,\\s*(\\d{10,}),`,
      "i",
    ),
  );
  const ts = match ? Number(match[1]) : 0;
  if (!Number.isFinite(ts) || ts <= 0) return undefined;
  const date = new Date(ts);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parseMileageValue(raw: string | undefined) {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (/unknown|not\s+verified|exempt|n\/a|not\s+available/.test(lower)) {
    return undefined;
  }
  const match = raw.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,6})\b/);
  if (!match) return undefined;
  const miles = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(miles) && miles >= 500 && miles <= 500000
    ? miles
    : undefined;
}

export function parsePublicSurplusDetailHtml(html: string): Partial<Deal> {
  const flat = html.replace(/\s+/g, " ");
  const field = (label: string) => {
    const match = flat.match(
      new RegExp(
        `<span class="auctitle">\\s*${label}:\\s*<\\/span>\\s*<span>\\s*([^<]+?)\\s*<\\/span>`,
        "i",
      ),
    );
    return match ? decode(match[1]) : undefined;
  };
  const mileage = parseMileageValue(field("Mileage"));
  const vin = field("VIN");
  return {
    ...(mileage ? { mileage } : {}),
    ...(vin ? { vin } : {}),
  };
}

export async function enrichPublicSurplusDetail(
  sourceUrl: string,
): Promise<Partial<Deal>> {
  const res = await scraperFetch(sourceUrl, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) return {};
  return parsePublicSurplusDetailHtml(await res.text());
}

/** Parse a PublicSurplus category browse page into vehicle auction rows. */
export function parsePublicSurplusHtml(html: string): Partial<Deal>[] {
  const items: Partial<Deal>[] = [];
  const seen = new Set<string>();
  // The card's title anchor carries both the auction id and a clean title:
  //   <a href=".../auction/view?auc=NNNN" title="#NNNN - 2012 Ford Fusion Sedan 4D">
  const re = /auction\/view\?auc=(\d+)"\s+title="#\d+\s*-\s*([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const auc = m[1];
    if (seen.has(auc)) continue;
    seen.add(auc);

    const title = decode(m[2]);
    if (!isCarOrTruck(title)) continue; // cars and trucks only
    const ym = title.match(/(19[5-9]\d|20[0-4]\d)/); // model year => it's a real vehicle
    if (!ym) continue;
    const year = parseInt(ym[0], 10);

    // Current bid: <b id="val_<auc>catGrid"> $1,234.00 </b>
    const pm = html.match(
      new RegExp(`id="val_${auc}catGrid"[^>]*>\\s*\\$?([\\d,]+(?:\\.\\d+)?)`),
    );
    const price = pm ? Math.round(parseFloat(pm[1].replace(/,/g, ""))) : 0;
    if (!price) continue; // no live bid value => not a usable lead

    // State badge sits in this card's image block (after a long lazy-load spinner block).
    const sm = html.match(
      new RegExp(
        `auc=${auc}"[\\s\\S]{0,1600}?auction-item-state">\\s*([A-Z]{2})`,
      ),
    );
    const state = sm ? sm[1] : undefined;
    const image = imageForAuction(html, auc);
    const auctionEnd = auctionEndForAuction(html, auc);

    // Rough year MAKE MODEL; normalizeDeal re-derives authoritatively + gates unknown makes.
    const after = title
      .slice((ym.index || 0) + 4)
      .trim()
      .split(/\s+/);
    const make = after[0] || "";
    const model = after.slice(1, 3).join(" ");

    items.push({
      source: "gov_auction",
      source_deal_id: auc,
      source_url: `https://www.publicsurplus.com/sms/auction/view?auc=${auc}`,
      title,
      year,
      make,
      model,
      ask_price: price,
      condition: "run_drive", // gov surplus, condition varies; treat as running unless noted
      images: image ? [image] : [],
      seller_type: "auction",
      seller: "PublicSurplus (gov surplus)",
      location_state: state,
      auction_end: auctionEnd,
      metadata: { auction: true, channel: "gov_surplus" },
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

export async function previewPublicSurplus(
  maxPagesPerCat = 1,
): Promise<Partial<Deal>[]> {
  const all: Partial<Deal>[] = [];
  for (const cat of VEHICLE_CATS) {
    let prevFirst = "";
    for (let page = 1; page <= maxPagesPerCat; page++) {
      const res = await scraperFetch(`${BASE}?catid=${cat}&page=${page}`, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      });
      if (!res.ok) break;
      const items = parsePublicSurplusHtml(await res.text());
      if (!items.length) break;
      const first = items[0].source_deal_id || "";
      if (first === prevFirst) break;
      prevFirst = first;
      all.push(...items);
    }
  }

  const byId = new Map<string, Partial<Deal>>();
  for (const d of all) {
    if (d.source_deal_id) byId.set(d.source_deal_id, d);
  }
  return Array.from(byId.values());
}

export async function scrapePublicSurplus(maxPagesPerCat = 4): Promise<number> {
  console.log("[PublicSurplus] Starting scrape...");
  const all: Partial<Deal>[] = [];
  for (const cat of VEHICLE_CATS) {
    let prevFirst = "";
    for (let page = 1; page <= maxPagesPerCat; page++) {
      try {
        const res = await scraperFetch(`${BASE}?catid=${cat}&page=${page}`, {
          headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        });
        if (!res.ok) break;
        const items = parsePublicSurplusHtml(await res.text());
        if (!items.length) break;
        // Stop if the page repeats (past the last real page it loops back to page 1).
        const first = items[0].source_deal_id || "";
        if (first === prevFirst) break;
        prevFirst = first;
        all.push(...items);
        await new Promise((r) => setTimeout(r, 800));
      } catch (e) {
        console.warn(
          `[PublicSurplus] cat ${cat} page ${page} failed:`,
          (e as Error).message,
        );
        break;
      }
    }
  }
  // De-dupe across categories by auction id.
  const byId = new Map<string, Partial<Deal>>();
  for (const d of all) byId.set(d.source_deal_id!, d);
  const deals = Array.from(byId.values());

  const detailLimit = Math.max(
    0,
    Math.min(200, Number(process.env.PUBLICSURPLUS_DETAIL_LIMIT || 60) || 0),
  );
  let enriched = 0;
  for (const deal of deals.slice(0, detailLimit)) {
    if (!deal.source_url || (deal.mileage && deal.vin)) continue;
    try {
      const detail = await enrichPublicSurplusDetail(deal.source_url);
      if (detail.mileage && !deal.mileage) deal.mileage = detail.mileage;
      if (detail.vin && !deal.vin) deal.vin = detail.vin;
      if (detail.mileage || detail.vin) enriched++;
    } catch {
      // Detail pages are best-effort; the browse rows remain usable without them.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (enriched) {
    console.log(
      `[PublicSurplus] Enriched ${enriched}/${Math.min(detailLimit, deals.length)} detail pages (VIN/mileage)`,
    );
  }

  console.log(`[PublicSurplus] Found ${deals.length} vehicle auctions`);
  return deals.length > 0 ? upsertDeals(deals) : 0;
}
