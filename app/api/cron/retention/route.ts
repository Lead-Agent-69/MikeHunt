export const dynamic = "force-dynamic";
// Daily cron (kera audit #9: no maxDuration). Explicit limit so it is not cut at a 10s legacy default.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// GET /api/cron/retention — daily Vercel cron. One RPC (public.run_retention) so the function
// stays light on Vercel Free: telemetry and queue history only. Listing retention runs on the
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
  console.log("[cron/retention] deleted", JSON.stringify(data));
  return NextResponse.json({ ok: true, deleted: data });
}
