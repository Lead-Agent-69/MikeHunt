export const dynamic = "force-dynamic";
// Daily cron (kera audit #9: no maxDuration). Explicit limit so it is not cut at a 10s legacy default.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// GET /api/cron/retention — daily Vercel cron. public.run_retention (telemetry and queue history),
// then public.purge_expired_vin_cache (VIN decode + recall cache rows 30 days past expiry). Two
// bounded RPCs on the existing cron, so no new Vercel cron is added. Protected listing retention
// is shared with scrape-ci; Zeus disk is cleaned by scripts/zeus-janitor.sh.
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
  const inventory = await createServerComponentClient().rpc(
    "prune_inventory_retention",
    { p_limit: 1000 },
  );
  if (inventory.error) {
    console.warn(
      "[cron/retention] protected inventory retention failed:",
      inventory.error.message,
    );
    return NextResponse.json(
      {
        ok: false,
        error: "Protected inventory retention failed",
        deleted: data,
      },
      { status: 503 },
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
  return NextResponse.json({
    ok: true,
    deleted: data,
    inventory: inventory.data,
    vinCache,
  });
}
