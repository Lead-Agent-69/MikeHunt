// lib/scrapers/sources/ebay-sold.ts
// Completed-listing price observations, not independently verified settlements.
// Hidden accepted offers and ambiguous prices cannot be treated as sold-price evidence.

import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSoldItemCache, saveSoldItemCache } from "./local-sold-cache";
import { getLocalWriteContext } from "../local-write-context";
import { disclosedPriceEvidence } from "@/lib/deals/acquisition-price";
import { extractLeadingVehicleIdentity } from "../tools/deal-normalizer";

import { politeFetch } from "../polite/polite-fetch";
import { recordScrapePersistence } from "../source-run-context";
import { sourceExecutionSignal } from "../source-execution";
import type { ScraperArgs } from "../tools/registry";

// The models dealers actually flip — captures sold prices across mainstream + truck/SUV demand.
const QUERIES = [
  "ford f150",
  "chevrolet silverado",
  "ram 1500",
  "gmc sierra",
  "toyota tacoma",
  "toyota camry",
  "toyota corolla",
  "honda accord",
  "honda civic",
  "jeep wrangler",
  "nissan altima",
  "ford mustang",
  "ford explorer",
  "chevrolet equinox",
  "subaru outback",
];

// Sold-price anchoring only helps a car if we have sold comps for THAT make/model. The static list above
// covers the popular flips, but the live inventory spans ~hundreds of models (Acura MDX, Corvette, …) that
// had ZERO sold coverage → their valuations fell back to inflated asking-price comps. So we additionally
// derive the top make/model pairs actually present in the active `deals` table and scrape sold prices for
// those too, so coverage tracks real inventory. Preserve full model names so "Model 3" or
// "Range Rover Sport" does not become a broader, different vehicle search.
async function dynamicQueries(
  sb: SupabaseClient,
  limit = 60,
): Promise<string[]> {
  const counts = new Map<string, number>();
  const PAGE = 1000;
  try {
    for (let off = 0; off < 24000; off += PAGE) {
      const { data, error } = await sb
        .from("deals")
        .select("make, model")
        .eq("active", true)
        .gt("ask_price", 0)
        .order("id", { ascending: true })
        .range(off, off + PAGE - 1);
      if (error || !data?.length) break;
      for (const d of data as { make: string; model: string }[]) {
        const query = soldInventoryQuery(d.make, d.model);
        if (query) counts.set(query, (counts.get(query) || 0) + 1);
      }
      if (data.length < PAGE) break;
    }
  } catch {
    /* fall back to the static list */
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

// Titles that are clearly NOT a whole sellable car — parts, project shells, etc.
const PARTS_RX =
  /\b(parts?|engine|transmission|motor only|hood|doors?|bumpers?|fenders?|seats?|wheels?|rims?|tires?|tyres?|axle|differential|ecu|ecm|module|mirrors?|headlights?|taillights?|grille|core support|parting out|for parts|no engine|shell only|gauge|cluster|harness|(?:owners?|service|repair|shop|workshop)\s+manual|brochure|hub ?cap|emblem|key fob)\b/i;

export function soldInventoryQuery(
  make?: string,
  model?: string,
): string | undefined {
  const mk = (make || "").trim().toLowerCase();
  const md = (model || "").trim().toLowerCase().replace(/\s+/g, " ");
  return mk.length > 1 && md.length > 1 ? `${mk} ${md}` : undefined;
}

const num = (t: unknown): number =>
  Number(String(t ?? "").replace(/[^0-9.]/g, "")) || 0;

/** Listing title only. Never a photo. Capped so the sold row stays thin. */
export function shortSoldTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 160);
}

export interface SoldRow {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  sold_price: number;
  sold_at?: string;
  /** Short listing title, including salvage wording when the sale is branded. */
  title?: string;
  source: string;
  location_state?: string;
  item_id: string;
  source_url: string;
}

/** Parse explicit USD sold-listing observations, excluding hidden accepted offers. */
export function parseEbaySoldHtml(html: string): SoldRow[] {
  const $ = cheerio.load(html);
  const rows: SoldRow[] = [];
  const seen = new Set<string>();

  $(".s-card, li.su-card-container").each((_: number, el: any) => {
    const card = $(el);
    const title = card
      .find(".s-card__title")
      .first()
      .text()
      .trim()
      .replace(/^(new listing|sponsored|top rated plus)\s*/i, "")
      .replace(/opens in a new window.*$/i, "")
      .trim();
    if (!title || /shop on ebay/i.test(title)) return;
    if (PARTS_RX.test(title)) return; // drop parts/project junk

    const ym = title.match(/(19[5-9]\d|20[0-4]\d)/);
    if (!ym) return;
    const year = parseInt(ym[0], 10);

    if (/best offer|or best|accepted offer/i.test(card.text())) return;
    const priceText = card.find(".s-card__price").first().text().trim();
    if (!/^(?:US\s*)?\$\s*\d[\d,]*(?:\.\d{2})?$/.test(priceText)) return;
    const sold_price = num(priceText);
    if (!sold_price || sold_price < 1000 || sold_price > 300000) return;
    const priceEvidence = disclosedPriceEvidence(card.text(), sold_price);
    if (
      priceEvidence &&
      (priceEvidence.kind !== "asking" ||
        priceEvidence.askingPrice !== sold_price)
    )
      return;

    const link =
      card.find("a.s-card__link").attr("href") ||
      card.find('a[href*="/itm/"]').first().attr("href") ||
      "";
    let absoluteLink: string;
    try {
      const url = new URL(link, "https://www.ebay.com");
      if (
        url.protocol !== "https:" ||
        !/^(?:www\.)?ebay\.com$/.test(url.hostname)
      )
        return;
      absoluteLink = url.toString();
    } catch {
      return;
    }
    const item_id = absoluteLink.match(/\/itm\/(\d+)/)?.[1] || "";
    if (!item_id || seen.has(item_id)) return;

    // "Sold Apr 28, 2026" caption → ISO date.
    const sm = card.text().match(/Sold\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/);
    let sold_at: string | undefined;
    if (sm) {
      const d = new Date(sm[1]);
      if (!isNaN(d.getTime())) sold_at = d.toISOString();
    }
    if (!sold_at) return;
    seen.add(item_id);

    const subtitle = card
      .find(".s-card__subtitle, .su-card-container__attributes")
      .text();
    // Require ≥3 digits directly before miles/mi, in a sane range, and not just the model year.
    const miMatch = subtitle.match(/(\d[\d,]{2,})\s*(?:miles|mi)\b/i);
    let mileage: number | undefined;
    if (miMatch) {
      const m = num(miMatch[1]);
      if (m >= 500 && m <= 500000 && m !== year) mileage = m;
    }

    const vehicleTitle = title.slice((ym.index || 0) + 4).trim();
    const identity = extractLeadingVehicleIdentity(vehicleTitle, year);
    // An unidentified observation must not enter a make/model valuation pool.
    if (!identity) return;
    const { make, model } = identity;

    rows.push({
      year,
      make,
      model,
      mileage,
      sold_price,
      sold_at,
      title: shortSoldTitle(title),
      source: "ebay_motors",
      item_id,
      source_url: absoluteLink.split("?")[0],
    });
  });

  return rows;
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

/** Refused access is an unavailable source, never a successful empty inventory. */
export async function fetchEbaySoldPage(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await politeFetch(url, {
    signal,
    maxRetries: 0,
    timeoutMs: 15_000,
  });
  const barrier =
    response.challenge ||
    /captcha|robot check|just a moment|verify you(?:'| a)re human|access denied/i.test(
      response.body.slice(0, 20_000),
    );
  if (!response.ok || barrier) {
    const reason =
      response.skipped ||
      (barrier ? "access challenge" : `HTTP ${response.status}`);
    getLocalWriteContext()?.onAccessBarrier?.({
      host: "www.ebay.com",
      status: response.status,
      reason,
    });
    throw new Error(`eBay completed listings unavailable: ${reason}`);
  }
  return response.body;
}

type SoldCollectorDeps = {
  client?: SupabaseClient;
  queries?: string[];
  fetchPage?: typeof fetchEbaySoldPage;
  pause?: () => Promise<void>;
};

export async function scrapeEbaySold(
  execution?: ScraperArgs,
  deps: SoldCollectorDeps = {},
): Promise<number> {
  const signal = sourceExecutionSignal(execution);
  signal?.throwIfAborted();
  const sb = deps.client || getLocalWriteContext()?.supabase || admin();
  const queries =
    deps.queries ||
    Array.from(new Set([...QUERIES, ...(await dynamicQueries(sb))]));
  const fetchPage = deps.fetchPage || fetchEbaySoldPage;
  const pause =
    deps.pause ||
    (() => new Promise<void>((resolve) => setTimeout(resolve, 1500)));
  const seen = await loadSoldItemCache();
  const observed = new Set<string>();
  const context = getLocalWriteContext();
  let insertedTotal = 0;
  console.log(
    `[eBay Sold] Checking ${queries.length} completed-listing searches`,
  );
  for (let index = 0; index < queries.length; index++) {
    signal?.throwIfAborted();
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(queries[index])}&_sacat=6001&LH_Sold=1&LH_Complete=1&_ipg=120`;
    const html = await fetchPage(url, signal);
    signal?.throwIfAborted();
    const rows = parseEbaySoldHtml(html).filter((row) => {
      if (observed.has(row.item_id)) return false;
      observed.add(row.item_id);
      return true;
    });
    const fresh = rows.filter((row) => !seen.has(row.item_id));
    const retainLocally = async () => {
      if (context && fresh.length)
        await context.cache.rememberOnly(
          "ebay_sold",
          fresh.map((row) => ({
            id: row.item_id,
            value: row as unknown as Record<string, unknown>,
          })),
        );
    };
    if (context?.cacheOnly) {
      await retainLocally();
      recordScrapePersistence(rows.length, 0);
    } else if (fresh.length) {
      if (context?.beforeWrite && !(await context.beforeWrite())) {
        await retainLocally();
        recordScrapePersistence(rows.length, 0);
        throw new Error(
          "Sold observation writes paused by capacity guard; observations retained locally",
        );
      }
      signal?.throwIfAborted();
      const insertRows = fresh.map((r) => ({
        vin: r.vin ?? null,
        year: r.year ?? null,
        make: r.make ?? null,
        model: r.model ?? null,
        trim: r.trim ?? null,
        mileage: r.mileage ?? null,
        sold_price: r.sold_price,
        sold_at: r.sold_at ?? null,
        title: r.title ? shortSoldTitle(r.title) : null,
        source: r.source,
        source_item_id: r.item_id,
        source_url: r.source_url,
        currency_code: "USD",
        country_code: "US",
        location_state: r.location_state ?? null,
      }));
      let result;
      try {
        result = await sb
          .from("sold_listings")
          .upsert(insertRows, {
            onConflict: "source,source_item_id",
            ignoreDuplicates: true,
          })
          .select("source_item_id");
      } catch (error) {
        await retainLocally();
        recordScrapePersistence(rows.length, 0);
        throw error;
      }
      if (result.error) {
        await retainLocally();
        recordScrapePersistence(rows.length, 0);
        throw new Error("Completed-listing observations could not be stored");
      }
      const inserted = result.data?.length ?? 0;
      recordScrapePersistence(rows.length, inserted);
      insertedTotal += inserted;
      // Advance the local dedupe cache only after the database confirms this batch.
      for (const row of fresh) seen.add(row.item_id);
      await saveSoldItemCache(seen);
    } else {
      recordScrapePersistence(rows.length, 0);
    }
    if (index < queries.length - 1) {
      signal?.throwIfAborted();
      await pause();
    }
  }
  console.log(
    `[eBay Sold] Observed ${observed.size} qualifying completed listings; inserted ${insertedTotal}`,
  );
  return insertedTotal;
}
