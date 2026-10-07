export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enrichCraigslistDetail } from "@/lib/scrapers/sources/index";
import { canManageOperations } from "@/lib/auth/admin-operations";
import { UrlNotAllowedError } from "@/lib/net/public-url";

/** Defense-in-depth: enrich-backfill only fetches Craigslist detail hosts. */
export function isCraigslistDetailUrl(raw: string): boolean {
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    return (
      hostname === "craigslist.org" || hostname.endsWith(".craigslist.org")
    );
  } catch {
    return false;
  }
}

// POST /api/admin/enrich-backfill — fetch the REAL Craigslist detail page for active deals that are
// missing photos and pull their actual images/VIN/mileage. New scrapes enrich inline (capped), but
// existing deals never get revisited — this backfills them. Real data only; no fabrication.
// Gated by INGEST_SECRET. Body: { limit?, goOnly?, maxLookups? }.
const CORS = { "Access-Control-Allow-Origin": "*" };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  if (!(await canManageOperations(req))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty ok */
  }
  const maxLookups = Math.min(120, Math.max(1, Number(body.maxLookups) || 40));
  const goOnly = body.goOnly !== false; // default: prioritize GO deals
  const sb = admin();

  // Active Craigslist deals with a detail URL but no photos. GO first (those are what's shown).
  let q = sb
    .from("deals")
    .select("id, source_url, vin")
    .eq("active", true)
    .in("source", ["craigslist", "craigslist_dealer"])
    .not("source_url", "is", null)
    .or("images.is.null,images.eq.{}")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(maxLookups);
  if (goOnly) q = q.eq("deal_verdict", "go");

  const { data: deals, error } = await q;
  if (error) {
    console.error("[admin/enrich-backfill]", error.message);
    return NextResponse.json(
      { error: "Request failed" },
      { status: 500, headers: CORS },
    );
  }
  if (!deals?.length)
    return NextResponse.json(
      { scanned: 0, updated: 0, withImages: 0 },
      { headers: CORS },
    );

  let updated = 0;
  let withImages = 0;
  for (let i = 0; i < deals.length; i++) {
    const d = deals[i];
    if (i > 0) await sleep(400); // be polite to Craigslist
    const sourceUrl = d.source_url as string;
    // Refuse non-CL hosts (and let UrlNotAllowedError skip private/metadata URLs).
    if (!isCraigslistDetailUrl(sourceUrl)) continue;
    try {
      const extra = await enrichCraigslistDetail(sourceUrl);
      const patch: any = {};
      if (Array.isArray(extra.images) && extra.images.length) {
        patch.images = extra.images.slice(0, 12);
        withImages++;
      }
      if (extra.vin && !d.vin) patch.vin = extra.vin;
      if (extra.mileage) patch.mileage = extra.mileage;
      if (Object.keys(patch).length) {
        const { error: upErr } = await sb
          .from("deals")
          .update(patch)
          .eq("id", d.id);
        if (!upErr) updated++;
      }
    } catch (error) {
      if (error instanceof UrlNotAllowedError) continue;
      /* skip this one */
    }
  }

  const { count: remaining } = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("deal_verdict", "go")
    .or("images.is.null,images.eq.{}");

  return NextResponse.json(
    {
      scanned: deals.length,
      updated,
      withImages,
      goRemainingNoImage: remaining ?? null,
    },
    { headers: CORS },
  );
}
