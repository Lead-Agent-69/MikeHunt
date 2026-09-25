export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cacheVehiclePhotos } from "@/lib/images/cache";

// POST /api/admin/cache-photos — download + permanently host the photos of top deals in Supabase
// Storage, then point deals.images at our own URLs. GO + highest-profit first. Gated by INGEST_SECRET.
// Body: { limit?, goOnly?, maxPerDeal? }.
const CORS = { "Access-Control-Allow-Origin": "*" };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json(
        { error: "Disabled: set INGEST_SECRET." },
        { status: 503, headers: CORS },
      );
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ok */
  }
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 25));
  const maxPerDeal = Math.min(8, Math.max(1, Number(body.maxPerDeal) || 5));
  const goOnly = body.goOnly !== false;

  const sb = admin();
  let q = sb
    .from("deals")
    .select("id, images")
    .eq("active", true)
    .or("images_cached.is.null,images_cached.eq.false")
    .not("images", "is", null)
    .neq("images", "{}")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (goOnly) q = q.eq("deal_verdict", "go");

  const { data: deals, error } = await q;
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS },
    );
  if (!deals?.length)
    return NextResponse.json({ scanned: 0, cached: 0 }, { headers: CORS });

  let cached = 0;
  let photos = 0;
  for (const d of deals) {
    const urls: string[] = Array.isArray(d.images) ? d.images : [];
    const httpUrls = urls.filter((u) => /^https?:\/\//.test(u));
    if (!httpUrls.length) {
      await sb.from("deals").update({ images_cached: true }).eq("id", d.id);
      continue;
    }
    const hosted = await cacheVehiclePhotos(sb, d.id, httpUrls, maxPerDeal);
    if (hosted.length) {
      await sb
        .from("deals")
        .update({ images: hosted, images_cached: true })
        .eq("id", d.id);
      cached++;
      photos += hosted.length;
    }
  }

  const { count: remaining } = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .eq("deal_verdict", "go")
    .or("images_cached.is.null,images_cached.eq.false")
    .not("images", "is", null)
    .neq("images", "{}");

  return NextResponse.json(
    {
      scanned: deals.length,
      cachedDeals: cached,
      photos,
      goRemaining: remaining ?? null,
    },
    { headers: CORS },
  );
}
