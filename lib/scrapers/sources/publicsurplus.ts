// lib/scrapers/sources/publicsurplus.ts
// PublicSurplus.com — government/municipal surplus auctions, fully OPEN (no Cloudflare, no login).
// Police/fleet cars, trucks and vans sell here for a fraction of retail — prime cheap-acquisition
// leads for a flipping dealer. We browse the vehicle categories (403 Auto, 404 Truck) with GET
// pagination and parse the listing cards. Prices are the CURRENT auction bid, not asking; the
// pipeline's known-make gate naturally filters non-cars (buses/equipment) that share the category.

import type { Deal } from "@/types";
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
      images: [],
      seller_type: "dealer",
      seller: "PublicSurplus (gov surplus)",
      location_state: state,
      metadata: { auction: true, channel: "gov_surplus" },
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

export async function scrapePublicSurplus(maxPagesPerCat = 4): Promise<number> {
  console.log("[PublicSurplus] Starting scrape...");
  const all: Partial<Deal>[] = [];
  for (const cat of VEHICLE_CATS) {
    let prevFirst = "";
    for (let page = 1; page <= maxPagesPerCat; page++) {
      try {
        const res = await fetch(`${BASE}?catid=${cat}&page=${page}`, {
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

  console.log(`[PublicSurplus] Found ${deals.length} vehicle auctions`);
  if (deals.length > 0) await upsertDeals(deals);
  return deals.length;
}
