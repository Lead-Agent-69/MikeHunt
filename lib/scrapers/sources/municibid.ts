import { assertSourceAccess } from "../access-policy";
// lib/scrapers/sources/municibid.ts
// Municibid.com — "America's leading online auction marketplace for government surplus" (7,000+ govt
// sellers). Police/fleet cars, township trucks, public-works vehicles — net-new free cheap-acquisition
// leads, sibling to PublicSurplus/GovDeals. Unlike GovDeals/AllSurplus (the Liquidity "maestro" JSON
// API), Municibid is a server-rendered ASP.NET site, so we parse the Automotive browse HTML directly —
// fully reachable from our IP, no login, no proxy. Each listing card carries id + title + current bid +
// location + agency + end date; we dedupe by id (the id appears twice per card) and gate on year+make.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";
import { isCarOrTruck } from "../vehicle-class";

const ORIGIN = "https://municibid.com";
// C160883 = the Automotive category (verified live). list view · active only · ending-soonest sort.
// The site moved to a React layout (2026-10): /browse?category=160883&page=N with <article class="listing-row">
// cards. The old ASP.NET URL now 301s to a page without data-listingid, which is why runs found 0.
const BROWSE = `${ORIGIN}/browse?category=160883`;
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

/** Current layout: <article class="listing-row"> cards. */
export function parseMunicibidRows(html: string): Partial<Deal>[] {
  const byId = new Map<string, Partial<Deal>>();
  const cards = html.split(/<article class="listing-row"/).slice(1);
  for (const raw of cards) {
    const card = raw.split(/<\/article>/)[0];
    const link = card.match(/href="\/listing\/(\d+)\/([a-z0-9-]+)"/i);
    if (!link) continue;
    const id = link[1];
    const title = clean(
      (card.match(/listing-row__title"><a[^>]*>([\s\S]*?)<\/a>/) || [])[1] ||
        link[2].replace(/-/g, " "),
    ).replace(/:\s*/g, " ");
    if (!isCarOrTruck(title)) continue;
    const ym = title.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
    if (!ym) continue;
    const price = Math.round(
      parseFloat(
        (
          (clean(card).match(/Current Bid:\s*\$\s*([\d,]+(?:\.\d+)?)/i) ||
            [])[1] || "0"
        ).replace(/,/g, ""),
      ),
    );
    if (!price) continue;
    const after = title
      .slice((ym.index || 0) + 4)
      .trim()
      .split(/\s+/);
    const where = clean(
      (card.match(/listing-row__where"><span>([\s\S]*?)<\/span>/) || [])[1] ||
        "",
    );
    const loc = where.match(/^(.+?),\s*([A-Z]{2})$/);
    const agency = clean(
      (card.match(/listing-row__agency"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "",
    );
    const bids = (clean(card).match(/Bid\(s\):\s*(\d+)/i) || [])[1];
    const img = (card.match(
      /<img[^>]+src="(https:\/\/storagemunicibid[^"]+)"/i,
    ) || [])[1];
    byId.set(id, {
      source: "gov_auction",
      source_deal_id: `mb-${id}`,
      source_url: `${ORIGIN}/listing/${id}/${link[2]}`,
      title,
      year: parseInt(ym[0], 10),
      make: after[0] || "",
      model: after.slice(1, 3).join(" "),
      ask_price: price,
      condition: "run_drive",
      location_city: loc ? loc[1].trim() : undefined,
      location_state: loc ? loc[2] : undefined,
      seller_type: "auction",
      seller: agency || "Municibid (gov surplus)",
      bid_count: bids ? parseInt(bids, 10) : undefined,
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

/** Parse a Municibid Automotive browse page into vehicle auction rows (current layout first). */
export function parseMunicibidHtml(html: string): Partial<Deal>[] {
  if (html.includes('class="listing-row"')) return parseMunicibidRows(html);
  return parseMunicibidLegacy(html);
}

/** Pre-2026-10 ASP.NET layout (data-listingid cards). */
function parseMunicibidLegacy(html: string): Partial<Deal>[] {
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

    if (!isCarOrTruck(title)) continue; // cars and trucks only
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

export async function previewMunicibid(maxPages = 1): Promise<Partial<Deal>[]> {
  assertSourceAccess("municibid");
  const byId = new Map<string, Partial<Deal>>();
  let prevFirst = "";

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${BROWSE}&page=${page}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) break;
    const items = parseMunicibidHtml(await res.text());
    if (!items.length) break;

    const first = items[0].source_deal_id || "";
    if (first === prevFirst) break;
    prevFirst = first;

    for (const d of items) {
      if (d.source_deal_id) byId.set(d.source_deal_id, d);
    }
  }

  return Array.from(byId.values());
}

export async function scrapeMunicibid(maxPages = 6): Promise<number> {
  assertSourceAccess("municibid");
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
  return deals.length > 0 ? upsertDeals(deals) : 0;
}
