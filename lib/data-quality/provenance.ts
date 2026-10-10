// lib/data-quality/provenance.ts
// Listing provenance (audit section I + Ren's lineage review): every deals row carries
//   source            true origin (deal_source enum; 'unknown' when we can't tell — never relabelled)
//   source_deal_id    stable listing id (the site's id, else a hash of the canonical URL)
//   source_url, first_seen_at (existing), fetched_at (this fetch), access_basis (access class).
// Columns fetched_at / access_basis / price_history.source come from 20261010230000 (Ren sign).

import { createHash } from "node:crypto";
import { accessClassFor, type AccessClass } from "@/lib/scrapers/access-class";

/** deal_source enum values on hosted, plus 'unknown' (added by 20261010230000). */
export const DEAL_SOURCES = new Set([
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "facebook_marketplace",
  "craigslist",
  "ebay_motors",
  "autotrader",
  "cars_com",
  "gov_auction",
  "repo_network",
  "independent_dealer",
  "cargurus",
  "craigslist_dealer",
  "carvana",
  "truecar",
  "vroom",
  "offerup",
  "acv",
  "unknown",
]);

const ALIASES: Record<string, string> = {
  facebook: "facebook_marketplace",
  fb_marketplace: "facebook_marketplace",
  ebay: "ebay_motors",
  cars: "cars_com",
  carscom: "cars_com",
  iaai: "iaa",
};

/**
 * The deal_source for a claimed source name. Hyphens/case are normalized ('facebook-marketplace' →
 * facebook_marketplace). Anything not in the enum is 'unknown' — never 'independent_dealer', which
 * would claim a reviewed dealer crawl the row didn't come from.
 */
export function toDealSource(raw: string | null | undefined): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  const v = ALIASES[s] || s;
  return DEAL_SOURCES.has(v) ? v : "unknown";
}

const TRACKING =
  /^(utm_|ref$|referrer$|fbclid$|gclid$|mibextid$|_trkparms$|_trksid$|hash$)/i;

/** Canonical listing URL: lowercase host without www, no fragment, no tracking params, no trailing slash. */
export function canonicalListingUrl(url: string): string {
  try {
    const u = new URL(String(url).trim());
    u.hash = "";
    for (const key of Array.from(u.searchParams.keys()))
      if (TRACKING.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    const qs = u.searchParams.toString();
    return `${u.protocol}//${host}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return String(url || "").trim();
  }
}

/** Stable source_deal_id for a listing with no site id: the same URL always maps to the same id. */
export function urlListingId(url: string): string {
  return `url:${createHash("sha256").update(canonicalListingUrl(url)).digest("hex").slice(0, 32)}`;
}

/** Columns added by 20261010230000; stripped from writes until hosted has them. */
export const PROVENANCE_COLUMNS = ["fetched_at", "access_basis"] as const;
export const PRICE_HISTORY_PROVENANCE_COLUMNS = ["source"] as const;

/** Access class stored on the row. Unknown source → 'unreviewed' (fail closed). */
export function accessBasisFor(row: {
  source?: string | null;
  source_url?: string | null;
}): AccessClass {
  if (!row.source || row.source === "unknown") return "unreviewed";
  return accessClassFor(row);
}
