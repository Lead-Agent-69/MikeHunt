export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// GET /api/cron/retention — daily Vercel cron. public.run_retention (telemetry and queue history),
// then public.purge_expired_vin_cache (VIN decode + recall cache rows 30 days past expiry). Two
// cheap RPCs on the existing cron, so no new Vercel cron is added. Listing retention runs on the
// Zeus scraper (scripts/scrape-ci.ts); Zeus disk is cleaned by scripts/zeus-janitor.sh.
// See docs/RETENTION.md.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured())
    return NextResponse.json({ ok: false, error: "Supabase not configured" });
  const { data, error } =
    await createServerComponentClient().rpc("run_retention");
  if (error) {
    console.warn("[cron/retention] run_retention failed:", error.message);
    return NextResponse.json(
      { ok: false, error: "run_retention failed" },
      { status: 500 },
    );
  }
  // VIN cache purge is best-effort: if the migration isn't applied yet (function missing) or it
  // fails, the main retention result still stands and the route still answers 200.
  let vinCache: unknown = null;
  const purge = await createServerComponentClient().rpc(
    "purge_expired_vin_cache",
  );
  if (purge.error) {
    console.warn(
      "[cron/retention] purge_expired_vin_cache failed:",
      purge.error.message,
    );
  } else {
    vinCache = Array.isArray(purge.data) ? (purge.data[0] ?? null) : purge.data;
  }
  console.log(
    "[cron/retention] deleted",
    JSON.stringify(data),
    "vin_cache",
    JSON.stringify(vinCache),
  );
  return NextResponse.json({ ok: true, deleted: data, vinCache });
}
