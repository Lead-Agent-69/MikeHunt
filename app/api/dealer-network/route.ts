export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CURATED_SITES, SITE_TYPE_META } from "@/lib/scrapers/curated-sites";
import { isSupabaseConfigured } from "@/lib/supabase";

// GET /api/dealer-network — the curated independent salvage/rebuilder/dealer network, each merged with its
// LIVE inventory + title-status breakdown (from the dealer_inventory aggregate, matched by source_url host).
// Powers the dealer directory + watchlist. Public, read-only.

const hostOf = (url: string) =>
  url
    .replace(/^https?:\/\/(www\.)?/i, "")
    .split("/")[0]
    .toLowerCase();

function hostKeys(url: string, inventoryUrl?: string) {
  return Array.from(
    new Set(
      [hostOf(url), inventoryUrl ? hostOf(inventoryUrl) : ""].filter(Boolean),
    ),
  );
}

type Inv = {
  total: number;
  clean: number;
  rebuilt: number;
  salvage: number;
  parts: number;
};

let cache: { at: number; map: Map<string, Inv> } | null = null;

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

export async function GET() {
  const now = Date.now();
  const configured = isSupabaseConfigured();
  let map = cache && now - cache.at < 15 * 60 * 1000 ? cache.map : null;
  if (!map && configured) {
    map = new Map<string, Inv>();
    try {
      const { data } = await service().rpc("dealer_inventory");
      for (const r of (data as Record<string, unknown>[]) || [])
        map.set(String(r.host), {
          total: Number(r.total) || 0,
          clean: Number(r.clean) || 0,
          rebuilt: Number(r.rebuilt) || 0,
          salvage: Number(r.salvage) || 0,
          parts: Number(r.parts) || 0,
        });
      if (map.size) cache = { at: now, map }; // never cache a transient failure
    } catch {
      /* directory still returns; counts default to 0 */
    }
  }
  if (!map) map = new Map<string, Inv>();

  const dealers = CURATED_SITES.map((s) => {
    const hosts = hostKeys(s.url, s.inventoryUrl);
    const inv = hosts.reduce<Inv | undefined>((found, host) => {
      if (found) return found;
      return map!.get(host);
    }, undefined);
    return {
      name: s.name,
      url: s.url,
      inventoryUrl: s.inventoryUrl ?? s.url,
      host: hosts[0],
      inventoryHost: hosts[1] ?? hosts[0],
      state: s.state ?? null,
      type: s.type,
      typeLabel: SITE_TYPE_META[s.type].label,
      accent: SITE_TYPE_META[s.type].accent,
      total: inv?.total ?? 0,
      clean: inv?.clean ?? 0,
      rebuilt: inv?.rebuilt ?? 0,
      salvage: inv?.salvage ?? 0,
      parts: inv?.parts ?? 0,
    };
  }).sort((a, b) => b.total - a.total);

  return NextResponse.json({
    configured,
    dealers,
    types: SITE_TYPE_META,
    totalDealers: dealers.length,
    liveDealers: dealers.filter((d) => d.total > 0).length,
    catalogedDealers: dealers.length,
    message: configured
      ? "Dealer network merged with live imported inventory where available."
      : "Dealer network is catalog-only until Supabase is connected and the curated dealer importer runs.",
  });
}
