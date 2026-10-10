// lib/scrapers/sources/ebay-sold.ts
// Completed-listing price observations, not independently verified settlements.
// Hidden accepted offers and ambiguous prices cannot be treated as sold-price evidence.

import { politeGate, politeRobotsPathFor, scraperFetch } from "@/lib/scrapers/polite";
import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSoldItemCache, saveSoldItemCache } from "./local-sold-cache";
import { getLocalWriteContext } from "../local-write-context";

const execFileAsync = promisify(execFile);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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
// those too, so coverage tracks real inventory. Returns "make model" search strings (model = first token,
// which matches eBay best for the common single-word models).
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
        const mk = (d.make || "").trim().toLowerCase();
        const md = (d.model || "")
          .trim()
          .toLowerCase()
          .split(/[\s,/]+/)[0]; // first token of the model
        if (mk.length > 1 && md.length > 1)
          counts.set(`${mk} ${md}`, (counts.get(`${mk} ${md}`) || 0) + 1);
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
  /\b(parts?|engine|transmission|motor only|hood|doors?|bumpers?|fenders?|seats?|wheels?|rims?|tires?|tyres?|axle|differential|ecu|ecm|module|mirrors?|headlights?|taillights?|grille|core support|parting out|for parts|no engine|shell only|gauge|cluster|harness|manual|brochure|hub ?cap|emblem|key fob)\b/i;

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

    const after = title
      .slice((ym.index || 0) + 4)
      .trim()
      .split(/\s+/);
    const make = after[0] || undefined;
    const model = after.slice(1, 3).join(" ") || undefined;

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

// eBay bot-walls the sold SRP and fingerprints the HTTP client — Node's fetch (undici) and even a
// stealth browser get challenged, but the system `curl` passes (and it's present in CI). So we fetch
// via curl with a shared cookie jar seeded from the homepage.
async function curlGet(
  url: string,
  jar: string,
): Promise<{ html: string; status: number }> {
  if (politeRobotsPathFor(url)) {
    // Polite robots path (not grandfathered): one honest request. No cookie-jar curl.
    const r = await scraperFetch(url, { headers: { Accept: "text/html" } });
    return { html: r.ok ? await r.text() : "", status: r.status };
  }
  // eBay sold is grandfathered (Jonah restored it): the curl path exactly as before, with the polite
  // per-domain delay and breaker around it.
  return politeGate(url, () => legacyCurlGet(url, jar), (r) => r.status || undefined);
}

async function legacyCurlGet(
  url: string,
  jar: string,
): Promise<{ html: string; status: number }> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sL",
      "-m",
      "35",
      "-A",
      UA,
      "-b",
      jar,
      "-c",
      jar,
      "-H",
      "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "-H",
      "Accept-Language: en-US,en;q=0.9",
      "-H",
      "Referer: https://www.ebay.com/",
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const marker = stdout.lastIndexOf("\n__HTTP_STATUS__:");
  if (marker < 0) return { html: stdout, status: 0 };
  return {
    html: stdout.slice(0, marker),
    status:
      Number(stdout.slice(marker + "\n__HTTP_STATUS__:".length).trim()) || 0,
  };
}

export async function scrapeEbaySold(): Promise<number> {
  console.log("[eBay Sold] Starting real-sold-price scrape...");
  const jar = join(tmpdir(), `ebsold_${process.pid}.jar`);
  // Warm-up: seed cookies from the homepage (legacy mode only).
  if (!politeRobotsPathFor("https://www.ebay.com/")) try {
    await execFileAsync("curl", [
      "-s",
      "-m",
      "15",
      "-A",
      UA,
      "-c",
      jar,
      "https://www.ebay.com/",
      "-o",
      "/dev/null",
    ]);
  } catch {
    /* warm-up best-effort */
  }

  // Static popular flips + the top models actually in inventory, deduped, so anchoring reaches the cars
  // users really see (not just 15 hardcoded models).
  const sb = admin();
  const dynamic = await dynamicQueries(sb);
  const queries = Array.from(new Set([...QUERIES, ...dynamic]));
  console.log(
    `[eBay Sold] ${queries.length} queries (${QUERIES.length} static + ${dynamic.length} from live inventory)`,
  );

  const all = new Map<string, SoldRow>();
  for (const q of queries) {
    try {
      const url =
        `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}` +
        `&_sacat=6001&LH_Sold=1&LH_Complete=1&_ipg=120`;
      const { html, status } = await curlGet(url, jar);
      const blocked =
        status === 403 ||
        status === 429 ||
        /captcha|robot check|just a moment|verify you(?:'| a)re human|access denied/i.test(
          html.slice(0, 20_000),
        );
      if (blocked) {
        const context = getLocalWriteContext();
        if (context?.respectAccessBlocks) {
          context.onAccessBarrier?.({
            host: "www.ebay.com",
            status,
            reason: status ? `HTTP ${status}` : "access barrier detected",
          });
          console.warn(
            "[eBay Sold] access barrier detected; stopping this source for the cycle",
          );
          break;
        }
      }
      const parsed = parseEbaySoldHtml(html);
      for (const r of parsed) all.set(r.item_id, r);
      await new Promise((r) => setTimeout(r, 1500)); // be polite
    } catch (e) {
      console.warn(`[eBay Sold] "${q}" failed:`, (e as Error).message);
    }
  }

  const rows = Array.from(all.values());
  if (!rows.length) {
    console.log("[eBay Sold] No sold rows parsed");
    return 0;
  }

  // Sold rows are immutable market observations. The mounted local cache avoids repeat Supabase
  // writes; the unique database index remains the cross-machine source of truth.
  const seen = await loadSoldItemCache();
  const fresh = rows.filter((r) => !seen.has(r.item_id));

  const localContext = getLocalWriteContext();
  if (localContext?.cacheOnly) {
    await localContext.cache.rememberOnly(
      "ebay_sold",
      fresh.map((row) => ({
        id: row.item_id,
        value: row as unknown as Record<string, unknown>,
      })),
    );
    console.log(
      `[eBay Sold] cache-only mode saved ${fresh.length} local observations; no Supabase writes`,
    );
    return 0;
  }

  if (fresh.length) {
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
    const { data: inserted, error } = await sb
      .from("sold_listings")
      .upsert(insertRows, {
        onConflict: "source,source_item_id",
        ignoreDuplicates: true,
      })
      .select("source_item_id");
    if (error) {
      console.warn("[eBay Sold] insert error:", error.message);
      return 0;
    }
    for (const row of fresh) seen.add(row.item_id);
    await saveSoldItemCache(seen);
    console.log(
      `[eBay Sold] parsed ${rows.length} completed listings; inserted ${inserted?.length ?? 0} new sales`,
    );
    return inserted?.length ?? 0;
  }

  console.log(
    `[eBay Sold] parsed ${rows.length} completed listings; ${rows.length} already known locally`,
  );
  return 0;
}
