export const dynamic = "force-dynamic";
// Daily cron (kera audit #9: no maxDuration). Explicit limit so it is not cut at a 10s legacy default.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

const headers = { "Cache-Control": "private, no-store" };
const telemetryTables = new Set([
  "deal_signals",
  "page_views",
  "deal_views",
  "scrape_jobs",
  "scraper_runs",
]);
const vinTables = new Set(["vin_rows", "recall_rows"]);

function confirmedCounts(value: unknown, allowedKeys: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid cleanup receipt");
  const entries = Object.entries(value);
  if (
    !entries.length ||
    entries.some(
      ([key, count]) =>
        !allowedKeys.has(key) || !Number.isSafeInteger(count) || count < 0,
    )
  )
    throw new Error("Invalid cleanup receipt");
  return value as Record<string, number>;
}

// This cron handles telemetry and regenerable VIN caches, not protected listing deletion.
// A lost/invalid receipt does not prove rollback: only earlier confirmed counts are returned.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req))
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  if (!isSupabaseConfigured())
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 503, headers },
    );

  let deleted: Record<string, number> | null = null;
  let step = "run_retention";
  try {
    const sb = createServerComponentClient();
    const retained = await sb
      .rpc("run_retention")
      .abortSignal(AbortSignal.timeout(20_000));
    if (retained.error) throw new Error("Cleanup unavailable");
    deleted = confirmedCounts(retained.data, telemetryTables);

    step = "purge_expired_vin_cache";
    const purge = await sb
      .rpc(step, { p_batch: 1000, p_max_batches: 1 })
      .abortSignal(AbortSignal.timeout(20_000));
    if (purge.error) throw new Error("Cleanup unavailable");
    const receipt =
      Array.isArray(purge.data) && purge.data.length === 1
        ? purge.data[0]
        : purge.data;
    const vinCache = confirmedCounts(receipt, vinTables);
    if (Object.keys(vinCache).length !== vinTables.size)
      throw new Error("Incomplete cleanup receipt");
    console.log("[cron/retention] confirmed", { deleted, vinCache });
    return NextResponse.json({ ok: true, deleted, vinCache }, { headers });
  } catch {
    console.warn("[cron/retention] completion unconfirmed", step);
    return NextResponse.json(
      {
        ok: false,
        error:
          step === "run_retention"
            ? "Telemetry cleanup not confirmed"
            : "VIN cache cleanup not confirmed",
        failedStep: step,
        completion: "unconfirmed",
        completedSteps: deleted ? ["run_retention"] : [],
        deleted,
        vinCache: null,
      },
      { status: 503, headers },
    );
  }
}
