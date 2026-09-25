// lib/scrapers/sources/municibid.ts
// Municibid.com — "America's leading online auction marketplace for government surplus" (7,000+ govt
// sellers). Police/fleet cars, township trucks, public-works vehicles — net-new free cheap-acquisition
// leads, sibling to PublicSurplus/GovDeals. Unlike GovDeals/AllSurplus (the Liquidity "maestro" JSON
// API), Municibid is a server-rendered ASP.NET site, so we parse the Automotive browse HTML directly —
// fully reachable from our IP, no login, no proxy. Each listing card carries id + title + current bid +
// location + agency + end date; we dedupe by id (the id appears twice per card) and gate on year+make.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";

const ORIGIN = "https://municibid.com";
// C160883 = the Automotive category (verified live). list view · active only · ending-soonest sort.
const BROWSE = `${ORIGIN}/Browse/C160883/Automotive?ViewStyle=list&StatusFilter=active_only&SortFilterOptions=1`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const clean = (t: string): string =>
  t
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Convert Municibid's "7/6/2026 11:00:00 AM" end date to ISO, or undefined if unparseable. */
function parseEnd(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Parse a Municibid Automotive browse page into vehicle auction rows. */
export function parseMunicibidHtml(html: string): Partial<Deal>[] {
  const byId = new Map<string, Partial<Deal>>();
  // The id appears twice per card; split on it and keep, per id, the chunk that actually has a bid.
  const parts = html.split(/data-listingid="(\d+)"/);
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    const chunk = parts[i + 1] || "";

    const slug = (chunk.match(/\/Listing\/Details\/\d+\/([A-Za-z0-9._-]+)/) ||
      [])[1];
    if (!slug) continue;
    const title = clean(slug.replace(/[-_]+/g, " "));

    const ym = title.match(/\b(19[5-9]\d|20[0-4]\d)\b/); // a model year => a real vehicle (not parts)
    if (!ym) continue;
    const year = parseInt(ym[0], 10);

    const text = clean(chunk);
    // Current bid (also shown even at 0 bids = the starting bid). No price => not yet live; skip.
    const pm = text.match(/CURRENT BID:\s*\$\s*([\d,]+(?:\.\d+)?)/i);
    if (!pm) continue;
    const price = Math.round(parseFloat(pm[1].replace(/,/g, "")));
    if (!price) continue;

    // Don't overwrite a good (priced) chunk with a later empty one.
    if (byId.has(id)) continue;

    const after = title
      .slice((ym.index || 0) + 4)
      .trim()
      .split(/\s+/);
    const make = after[0] || "";
    const model = after.slice(1, 3).join(" ");

    // Location renders as "{City}, {ST} | {Agency}", but the title repeats right before it, so a naive
    // match bleeds title words into the city ("Victoria Elkins Park"). Strip the title from the text
    // first, then the run before ", {ST}" is just the city. State is reliable regardless.
    const titleRe = new RegExp(
      title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
      "ig",
    );
    const noTitle = text.replace(titleRe, " ");
    const loc =
      noTitle.match(
        /([A-Z][a-z]+(?:[ .'-][A-Za-z]+){0,2})\s*,\s*([A-Z]{2})\b/,
      ) ||
      text.match(/([A-Z][a-z]+(?:[ .'-][A-Za-z]+){0,2})\s*,\s*([A-Z]{2})\b/);
    const agency = (text.match(/\|\s*([^|]+?)\s+(?:BIDS?|Bid\(s\)):/i) ||
      [])[1];
    const bids = (text.match(/BIDS?:\s*(\d+)/i) || [])[1];
    const ends = (text.match(/End(?:ed|s)?:\s*([\d/]+\s[\d:]+\s?[AP]M)/i) ||
      [])[1];

    const img = (chunk.match(
      /<img[^>]+src="(https:\/\/storagemunicibid[^"]+\.(?:jpg|jpeg|png))"/i,
    ) || [])[1];

    byId.set(id, {
      source: "gov_auction",
      source_deal_id: `mb-${id}`,
      source_url: `${ORIGIN}/Listing/Details/${id}`,
      title,
      year,
      make,
      model,
      ask_price: price,
      condition: "run_drive", // gov surplus; condition varies, treat as running unless noted
      location_city: loc ? loc[1].trim() : undefined,
      location_state: loc ? loc[2] : undefined,
      seller_type: "auction",
      seller: agency ? agency.trim() : "Municibid (gov surplus)",
      bid_count: bids ? parseInt(bids, 10) : undefined,
      auction_end: parseEnd(ends),
      images: img ? [img] : [],
      metadata: {
        auction: true,
        channel: "gov_surplus",
        marketplace: "municibid",
      },
      scraped_at: new Date().toISOString(),
    });
  }
  return Array.from(byId.values());
}

export async function scrapeMunicibid(maxPages = 6): Promise<number> {
  console.log("[Municibid] Starting scrape...");
  const byId = new Map<string, Partial<Deal>>();
  let prevFirst = "";

  for (let page = 1; page <= maxPages; page++) {
    let html: string;
    try {
      const res = await fetch(`${BROWSE}&page=${page}`, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      });
      if (!res.ok) break;
      html = await res.text();
    } catch (e) {
      console.warn(`[Municibid] page ${page} failed:`, (e as Error).message);
      break;
    }
    const items = parseMunicibidHtml(html);
    if (!items.length) break;

    // Past the last real page the site repeats page 1 — stop when the first lot repeats.
    const first = items[0].source_deal_id || "";
    if (first === prevFirst) break;
    prevFirst = first;

    for (const d of items) byId.set(d.source_deal_id!, d);
    await new Promise((r) => setTimeout(r, 800)); // be polite
  }

  const deals = Array.from(byId.values());
  console.log(`[Municibid] Found ${deals.length} vehicle auctions`);
  if (deals.length > 0) await upsertDeals(deals);
  return deals.length;
}
