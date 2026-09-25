// lib/scrapers/sources/ebay-sold.ts
// eBay Motors COMPLETED/SOLD listings = REAL transaction prices — the actual amount a vehicle sold
// for, NOT a delisted asking price. This is an honest source of real sale prices (the only other one
// besides dealer-logged deal_outcomes), and it's the RIGHT comp for the salvage/budget segment
// (Copart/PublicSurplus flips) where eBay's used-car buyers actually transact. eBay guards the sold
// SRP behind a bot wall, but a homepage cookie warm-up gets us in. We filter parts/project junk hard
// and store to public.sold_listings.

import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export interface SoldRow {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  sold_price: number;
  sold_at?: string;
  source: string;
  location_state?: string;
  item_id: string;
}

/** Parse an eBay SOLD/completed SRP (.s-card structure) into real sold-price rows. */
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

    // On the SOLD SRP, the card price IS the price it sold for.
    const sold_price = num(card.find(".s-card__price").first().text());
    if (!sold_price || sold_price < 1000 || sold_price > 300000) return;

    const link =
      card.find("a.s-card__link").attr("href") ||
      card.find('a[href*="/itm/"]').first().attr("href") ||
      "";
    const item_id = link.match(/\/itm\/(\d+)/)?.[1] || "";
    if (!item_id || seen.has(item_id)) return;
    seen.add(item_id);

    // "Sold Apr 28, 2026" caption → ISO date.
    const sm = card.text().match(/Sold\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/);
    let sold_at: string | undefined;
    if (sm) {
      const d = new Date(sm[1]);
      if (!isNaN(d.getTime())) sold_at = d.toISOString();
    }

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
      source: "ebay_motors",
      item_id,
    });
  });

  return rows;
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

// eBay bot-walls the sold SRP and fingerprints the HTTP client — Node's fetch (undici) and even a
// stealth browser get challenged, but the system `curl` passes (and it's present in CI). So we fetch
// via curl with a shared cookie jar seeded from the homepage.
async function curlGet(url: string, jar: string): Promise<string> {
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
      url,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout;
}

const naturalKey = (r: SoldRow): string =>
  `${r.source}|${r.year}|${r.make}|${r.model}|${r.sold_price}|${r.sold_at || ""}`;

export async function scrapeEbaySold(): Promise<number> {
  console.log("[eBay Sold] Starting real-sold-price scrape...");
  const jar = join(tmpdir(), `ebsold_${process.pid}.jar`);
  // Warm-up: seed cookies from the homepage.
  try {
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
      const html = await curlGet(url, jar);
      const parsed = parseEbaySoldHtml(html);
      for (const r of parsed) all.set(naturalKey(r), r);
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

  // Dedupe against what's already stored (the table has no external-id column → natural key).
  const { data: existing } = await sb
    .from("sold_listings")
    .select("year, make, model, sold_price, sold_at, source")
    .eq("source", "ebay_motors")
    .limit(20000);
  const have = new Set(
    (existing || []).map((e: any) =>
      naturalKey({ ...e, item_id: "" } as SoldRow),
    ),
  );
  const fresh = rows.filter((r) => !have.has(naturalKey(r)));

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
      source: r.source,
      location_state: r.location_state ?? null,
    }));
    const { error } = await sb.from("sold_listings").insert(insertRows);
    if (error) console.warn("[eBay Sold] insert error:", error.message);
  }

  console.log(
    `[eBay Sold] Parsed ${rows.length} sold listings, inserted ${fresh.length} new real sold prices`,
  );
  return fresh.length;
}
