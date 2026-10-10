// Dedup for aggregator-discovered listings (Visor, AutoTempest). Aggregators mostly re-list cars we
// already have from the origin site, so a discovered row is dropped when a stored deal already has its
// VIN or its canonical (origin) URL. The origin listing URL is the canonical link; the aggregator is
// kept only as provenance in options.discoveredVia / options.discoveredUrl (server-only jsonb).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deal } from "@/types";
import { createServerComponentClient } from "@/lib/supabase";
import { getLocalWriteContext } from "../local-write-context";

export type DiscoveredVia = "visor" | "autotempest";

const CHUNK = 100;

/** Canonical form for URL matching: https origin + path, no query/hash, no trailing slash. */
export function canonicalListingUrl(url: string | null | undefined): string {
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    const path = u.pathname.replace(/\/+$/, "");
    return `https://${u.hostname.toLowerCase().replace(/^www\./, "")}${path}`;
  } catch {
    return "";
  }
}

function adminClient(): SupabaseClient | null {
  const ctx = getLocalWriteContext();
  if (ctx?.supabase) return ctx.supabase;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return null;
  return createServerComponentClient();
}

/** VINs (upper-case) already stored in deals, from a candidate list. Read-only, chunked. */
export async function knownVins(
  vins: string[],
  sb: SupabaseClient | null = adminClient(),
): Promise<Set<string>> {
  const out = new Set<string>();
  const list = Array.from(
    new Set(vins.map((v) => v.trim().toUpperCase()).filter((v) => v.length === 17)),
  );
  if (!sb || !list.length) return out;
  for (let i = 0; i < list.length; i += CHUNK) {
    const { data, error } = await sb
      .from("deals")
      .select("vin")
      .in("vin", list.slice(i, i + CHUNK));
    if (error) throw new Error(`deals VIN lookup failed: ${error.message}`);
    for (const row of (data || []) as { vin: string | null }[])
      if (row.vin) out.add(row.vin.toUpperCase());
  }
  return out;
}

/** source_url values already stored in deals (exact and canonical forms). Read-only, chunked. */
export async function knownUrls(
  urls: string[],
  sb: SupabaseClient | null = adminClient(),
): Promise<Set<string>> {
  const out = new Set<string>();
  const list = Array.from(new Set(urls.filter(Boolean)));
  if (!sb || !list.length) return out;
  for (let i = 0; i < list.length; i += CHUNK) {
    const { data, error } = await sb
      .from("deals")
      .select("source_url")
      .in("source_url", list.slice(i, i + CHUNK));
    if (error) throw new Error(`deals URL lookup failed: ${error.message}`);
    for (const row of (data || []) as { source_url: string | null }[])
      if (row.source_url) {
        out.add(row.source_url);
        out.add(canonicalListingUrl(row.source_url));
      }
  }
  return out;
}

/**
 * Drop discovered rows we already hold (same VIN, or same canonical origin URL), and duplicates
 * inside the batch. Returns the rows to store and how many were dropped.
 */
export async function dropKnownListings(
  deals: Partial<Deal>[],
  sb: SupabaseClient | null = adminClient(),
): Promise<{ fresh: Partial<Deal>[]; dropped: number }> {
  const vins = await knownVins(
    deals.map((d) => d.vin || "").filter(Boolean),
    sb,
  );
  const urls = await knownUrls(
    deals.map((d) => d.source_url || "").filter(Boolean),
    sb,
  );
  const seenVin = new Set<string>();
  const seenUrl = new Set<string>();
  const fresh: Partial<Deal>[] = [];
  for (const d of deals) {
    const vin = (d.vin || "").toUpperCase();
    const url = canonicalListingUrl(d.source_url);
    if (vin && (vins.has(vin) || seenVin.has(vin))) continue;
    if (
      url &&
      (urls.has(url) || urls.has(d.source_url || "") || seenUrl.has(url))
    )
      continue;
    if (vin) seenVin.add(vin);
    if (url) seenUrl.add(url);
    fresh.push(d);
  }
  return { fresh, dropped: deals.length - fresh.length };
}
