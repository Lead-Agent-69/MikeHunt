// lib/scrapers/sources/visor.ts
// Visor.vin listings (Jonah 2026-10-10: capture Visor and AutoTempest listings). Visor's terms bar
// unauthorized linking and use "as part of any effort to compete", so this is an operator_override
// (lib/scrapers/access-class.ts), not permission.
//
// What we read, and only this: the public listing sitemap Visor publishes for search engines
// (https://visor.vin/sitemaps/listings/fresh) and the public listing pages it links to, which carry a
// schema.org Vehicle JSON-LD block (VIN, price, mileage, dealer, dealer's own listing URL). robots.txt
// is "Allow: /" and the pages are "index, follow". No login, no captcha bypass, no proxies, no
// browser: every request goes through politeFetch (honest User-Agent, robots, per-domain pacing,
// backoff, breaker). A challenge or ban signal stops the source for the run and is recorded.
//
// Rows are stored under the dealer's own listing URL (the canonical link) with
// options.discoveredVia = "visor"; VINs or URLs we already hold are skipped before any page fetch.

import type { Deal } from "@/types";
import { politeFetch } from "@/lib/scrapers/polite";
import { upsertDeals } from "../pipeline";
import { getLocalWriteContext } from "../local-write-context";
import {
  canonicalListingUrl,
  dropKnownListings,
  knownVins,
} from "./aggregator-dedup";

export const VISOR_ORIGIN = "https://visor.vin";
export const VISOR_FRESH_SITEMAP = `${VISOR_ORIGIN}/sitemaps/listings/fresh`;
const VIN_RX = /^[A-HJ-NPR-Z0-9]{17}$/;
const MAX_IMAGES = 6;
const DEFAULT_MAX_PER_RUN = 100;

export interface VisorSitemapEntry {
  url: string;
  vin: string;
  lastmod?: string;
}

/** Listing URLs + VINs from a Visor listings sitemap, newest lastmod first. */
export function parseVisorSitemap(xml: string): VisorSitemapEntry[] {
  const out: VisorSitemapEntry[] = [];
  const seen = new Set<string>();
  for (const block of String(xml || "")
    .split(/<url>/i)
    .slice(1)) {
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    let u: URL;
    try {
      u = new URL(loc);
    } catch {
      continue;
    }
    if (u.hostname !== "visor.vin") continue;
    const vin = u.pathname.match(
      /^\/search\/listings\/([A-Za-z0-9]{17})\/?$/,
    )?.[1];
    if (!vin || !VIN_RX.test(vin.toUpperCase())) continue;
    const key = vin.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lastmod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1];
    out.push({
      url: `${VISOR_ORIGIN}/search/listings/${key}`,
      vin: key,
      lastmod,
    });
  }
  return out.sort((a, b) =>
    String(b.lastmod || "").localeCompare(String(a.lastmod || "")),
  );
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const numOf = (v: unknown): number | undefined => {
  const n =
    typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function vehicleJsonLd(html: string): Record<string, any> | undefined {
  const rx =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of list) {
        const type = node?.["@type"];
        if (
          type === "Vehicle" ||
          type === "Car" ||
          (Array.isArray(type) && type.includes("Vehicle"))
        )
          return node;
      }
    } catch {
      /* ignore a malformed block */
    }
  }
  return undefined;
}

function httpsUrl(raw: unknown): string | undefined {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Photo URLs are stored only when https (never http, data: or protocol-relative). */
function httpsOnly(raw: unknown): string | undefined {
  try {
    const u = new URL(String(raw || ""));
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const NON_CAR_RX =
  /\b(motorcycle|motorbike|scooter|atv|utv|snowmobile|boat|trailer|rv|motorhome|camper)\b/i;

/**
 * One Visor listing page -> a thin deal row, or undefined when the page has no usable Vehicle block
 * (no VIN, no price, not a car/truck). The dealer's own listing URL is the canonical source_url; the
 * Visor page is kept as options.discoveredUrl. Seller phone is not stored.
 */
export function parseVisorListing(
  html: string,
  visorUrl: string,
): Partial<Deal> | undefined {
  const v = vehicleJsonLd(html);
  if (!v) return undefined;
  const vin = str(v.vehicleIdentificationNumber)?.toUpperCase();
  if (!vin || !VIN_RX.test(vin)) return undefined;
  const offers = Array.isArray(v.offers) ? v.offers[0] : v.offers;
  const price = numOf(offers?.price);
  if (!price || price < 500 || price > 500_000) return undefined;
  if (
    offers?.availability &&
    !/InStock|LimitedAvailability|PreOrder|OnlineOnly/i.test(
      String(offers.availability),
    )
  )
    return undefined;
  const bodyType = str(v.bodyType);
  if (bodyType && NON_CAR_RX.test(bodyType)) return undefined;

  const name = str(v.name) || "";
  const year = Number(name.match(/^\s*((?:19|20)\d{2})\b/)?.[1]) || undefined;
  const make = str(v.brand?.name) || str(v.manufacturer?.name) || str(v.brand);
  const model = str(v.model);
  let trim: string | undefined;
  if (year && make && model) {
    const rest = name
      .replace(/\s+for sale in\s+.*$/i, "")
      .replace(new RegExp(`^\\s*${year}\\s+`), "");
    const lower = rest.toLowerCase();
    const prefix = `${make} ${model}`.toLowerCase();
    if (lower.startsWith(prefix))
      trim = str(rest.slice(prefix.length)) || undefined;
  }
  const seller = v.seller || offers?.seller || {};
  const address = seller.address || {};
  const dealerUrl = httpsUrl(seller.url);
  const images = (Array.isArray(v.image) ? v.image : v.image ? [v.image] : [])
    .map(httpsOnly)
    .filter(Boolean)
    .slice(0, MAX_IMAGES) as string[];
  const state = str(address.addressRegion);

  return {
    source: "independent_dealer",
    source_deal_id: `visor-${vin}`,
    // Canonical link = the dealer's own listing; Visor only when the dealer link is missing.
    source_url: dealerUrl || visorUrl,
    title:
      name.replace(/\s+for sale in\s+.*$/i, "").trim() ||
      `${year ?? ""} ${make ?? ""} ${model ?? ""}`.trim(),
    year,
    make,
    model,
    trim,
    vin,
    ask_price: Math.round(price),
    mileage: numOf(v.mileageFromOdometer?.value ?? v.mileageFromOdometer),
    images,
    location_city: str(address.addressLocality),
    location_state: state && /^[A-Z]{2}$/.test(state) ? state : undefined,
    location_zip: str(address.postalCode),
    // No dealer name in seller / options.seller (Ren #321 P2): seller_type only.
    seller_type: "dealer",
    scraped_at: new Date().toISOString(),
    // Persisted by the pipeline into deals.options (server-only jsonb).
    ...({
      options: {
        discoveredVia: "visor",
        discoveredUrl: visorUrl,
        canonicalUrl: canonicalListingUrl(dealerUrl || visorUrl),
        sellerType: "dealer",
        bodyType,
      },
    } as Record<string, unknown>),
  } as Partial<Deal>;
}

export type VisorOutcome = "ok" | "challenged" | "blocked" | "robots" | "empty";

export interface VisorRunResult {
  outcome: VisorOutcome;
  reason?: string;
  sitemapListings: number;
  alreadyKnown: number;
  fetched: number;
  parsed: number;
  deduped: number;
  stored: number;
}

function recordBarrier(status: number, reason: string) {
  getLocalWriteContext()?.onAccessBarrier?.({
    host: "visor.vin",
    status,
    reason,
  });
}

/** Read one page politely. A challenge/ban/robots answer is returned as a barrier, never retried around. */
async function politeGet(
  url: string,
  accept: string,
): Promise<{
  body?: string;
  barrier?: { outcome: VisorOutcome; status: number; reason: string };
}> {
  const res = await politeFetch(url, {
    accept,
    timeoutMs: 20_000,
    maxRetries: 1,
  });
  if (res.challenge)
    return {
      barrier: {
        outcome: "challenged",
        status: res.status,
        reason: "bot challenge page",
      },
    };
  if (res.skipped === "robots")
    return {
      barrier: { outcome: "robots", status: 0, reason: "robots.txt disallows" },
    };
  if (res.skipped === "breaker")
    return {
      barrier: {
        outcome: "challenged",
        status: 0,
        reason: "domain paused by breaker",
      },
    };
  if (res.status === 403 || res.status === 429)
    return {
      barrier: {
        outcome: "blocked",
        status: res.status,
        reason: `HTTP ${res.status}`,
      },
    };
  if (!res.ok) return {};
  return { body: res.body };
}

export async function runVisorCapture(
  maxPerRun = Math.max(
    1,
    Number(process.env.VISOR_MAX_PER_RUN) || DEFAULT_MAX_PER_RUN,
  ),
): Promise<VisorRunResult> {
  const result: VisorRunResult = {
    outcome: "ok",
    sitemapListings: 0,
    alreadyKnown: 0,
    fetched: 0,
    parsed: 0,
    deduped: 0,
    stored: 0,
  };
  const sm = await politeGet(
    VISOR_FRESH_SITEMAP,
    "application/xml,text/xml;q=0.9,*/*;q=0.5",
  );
  if (sm.barrier) {
    recordBarrier(sm.barrier.status, sm.barrier.reason);
    return {
      ...result,
      outcome: sm.barrier.outcome,
      reason: sm.barrier.reason,
    };
  }
  const entries = parseVisorSitemap(sm.body || "");
  result.sitemapListings = entries.length;
  if (!entries.length)
    return { ...result, outcome: "empty", reason: "sitemap had no listings" };

  // Skip VINs we already hold before spending a request on them.
  const known = await knownVins(entries.map((e) => e.vin));
  const todo = entries.filter((e) => !known.has(e.vin)).slice(0, maxPerRun);
  result.alreadyKnown =
    entries.length - entries.filter((e) => !known.has(e.vin)).length;

  const rows: Partial<Deal>[] = [];
  for (const entry of todo) {
    const page = await politeGet(
      entry.url,
      "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    );
    if (page.barrier) {
      recordBarrier(page.barrier.status, page.barrier.reason);
      result.outcome = page.barrier.outcome;
      result.reason = page.barrier.reason;
      break;
    }
    result.fetched += 1;
    const row = page.body ? parseVisorListing(page.body, entry.url) : undefined;
    if (row) rows.push(row);
  }
  result.parsed = rows.length;
  const { fresh, dropped } = await dropKnownListings(rows);
  result.deduped = dropped;
  if (fresh.length) result.stored = await upsertDeals(fresh);
  return result;
}

/** Runner entry. Fails the run (recorded as an error) when Visor challenged us and nothing was read. */
export async function scrapeVisor(): Promise<number> {
  console.log(
    "[Visor] Starting sitemap capture (politeFetch, operator_override)...",
  );
  const r = await runVisorCapture();
  console.log(
    `[Visor] ${r.outcome}${r.reason ? ` (${r.reason})` : ""}: sitemap ${r.sitemapListings}, already known ${r.alreadyKnown}, fetched ${r.fetched}, parsed ${r.parsed}, deduped ${r.deduped}, stored ${r.stored}`,
  );
  if (r.outcome !== "ok" && r.outcome !== "empty" && r.parsed === 0)
    throw new Error(
      `${r.outcome}: visor.vin ${r.reason ?? ""}; 0 rows (no bypass attempted)`.trim(),
    );
  return r.parsed - r.deduped;
}
