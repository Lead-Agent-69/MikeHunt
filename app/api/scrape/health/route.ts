// app/api/scrape/health/route.ts
// Health dashboard API: source status, last run, failure rate, registry stats.

import { NextRequest, NextResponse } from "next/server";
import { createScraperRegistry } from "@/lib/scrapers/runner";
import { createClient } from "@supabase/supabase-js";
import { canSeeScrapeDetail } from "@/lib/auth/scrape-gate";
import { isSupabaseConfigured } from "@/lib/supabase";
import { gradeDataQuality } from "@/lib/data-quality";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";
import { previewPublicSurplus } from "@/lib/scrapers/sources/publicsurplus";

export const dynamic = "force-dynamic";

async function publicProbe(fetchRows: () => Promise<Partial<any>[]>) {
  try {
    const rows = await fetchRows();
    return {
      readiness: rows.length ? "ready" : "no_rows",
      lastStatus: rows.length ? "success" : "no_rows",
      activeRows: rows.length,
      rowsWithPhotos: rows.filter(
        (row: any) => Array.isArray(row.images) && row.images.length > 0,
      ).length,
      averageQuality: rows.length
        ? Math.round(
            rows.reduce((sum: number, row: any) => {
              return (
                sum +
                gradeDataQuality({
                  images: row.images,
                  vin: row.vin,
                  condition: row.condition,
                  damageType: row.damage_type,
                  mileage: row.mileage,
                  locationCity: row.location_city,
                  locationState: row.location_state,
                  askPrice: row.ask_price,
                  seller: row.seller,
                  sellerType: row.seller_type,
                  sourceUrl: row.source_url,
                }).score
              );
            }, 0) / rows.length,
          )
        : 0,
      lastSeenAt: rows[0]?.scraped_at || new Date().toISOString(),
      error: null as string | null,
    };
  } catch (error) {
    return {
      readiness: "blocked",
      lastStatus: "error",
      activeRows: 0,
      rowsWithPhotos: 0,
      averageQuality: 0,
      lastSeenAt: null,
      error: error instanceof Error ? error.message : "Probe failed",
    };
  }
}

// Read-only health, deliberately UNAUTHENTICATED so scripts/freshness-monitor.mjs and the
// /orchestrator SWR fetch both keep working (neither sends an Authorization header). What IS
// withheld from anonymous callers is `lastError`: scraper_runs.error_message can carry file paths
// and upstream URLs. Everything else here is non-sensitive operational metadata.
export async function GET(request: NextRequest) {
  const showInternalErrors = await canSeeScrapeDetail(request);
  try {
    const registry = createScraperRegistry();
    const sources = registry.getAll();

    if (!isSupabaseConfigured()) {
      const publicProof = new Map<
        string,
        Awaited<ReturnType<typeof publicProbe>>
      >();
      const probeResults = await Promise.all([
        publicProbe(() => previewGovDeals(1)).then(
          (proof) => ["govdeals", proof] as const,
        ),
        publicProbe(() => previewPublicSurplus(1)).then(
          (proof) => ["publicsurplus", proof] as const,
        ),
        publicProbe(() => previewMunicibid(1)).then(
          (proof) => ["municibid", proof] as const,
        ),
      ]);
      for (const [id, proof] of probeResults) publicProof.set(id, proof);

      const health = sources.map((source) => {
        const proof = publicProof.get(source.id);
        return {
          id: source.id,
          name: source.name,
          type: source.type,
          priority: source.priority,
          enabled: source.enabled,
          requiresAuth: source.requiresAuth,
          stealthRequired: source.stealthRequired,
          frequencyMinutes: source.frequencyMinutes,
          isDue: !proof,
          lastRunAt: null,
          lastStatus: proof?.lastStatus || "not_configured",
          lastError: showInternalErrors
            ? proof?.error || (proof ? null : "Supabase is not configured")
            : null,
          totalRuns: 0,
          failedRuns: proof?.readiness === "blocked" ? 1 : 0,
          successRate: proof?.readiness === "blocked" ? 0 : 100,
          estimatedDealsPerRun: source.estimatedDealsPerRun,
          readiness:
            proof?.readiness ||
            (source.requiresAuth ? "needs_login" : "not_configured"),
          activeRows: proof?.activeRows || 0,
          rowsWithPhotos: proof?.rowsWithPhotos || 0,
          averageQuality: proof?.averageQuality || 0,
          lastSeenAt: proof?.lastSeenAt || null,
        };
      });

      return NextResponse.json({
        configured: false,
        total: sources.length,
        enabled: sources.filter((s) => s.enabled).length,
        due: health.filter((h) => h.isDue).length,
        healthy: health.filter((h) => h.readiness === "ready").length,
        sources: health,
      });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    );

    const sourceIds = sources.map((s) => s.id);
    const { data: recentRuns, error } = await supabase
      .from("scraper_runs")
      .select(
        "source, status, completed_at, error_message, deals_found, duration_ms",
      )
      .in("source", sourceIds)
      .order("completed_at", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: activeDeals, error: dealsError } = await supabase
      .from("deals")
      .select(
        "source, images, vin, condition, damage_type, mileage, location_city, location_state, ask_price, seller, seller_type, source_url, last_seen_at",
      )
      .eq("active", true)
      .in("source", sourceIds)
      .order("last_seen_at", { ascending: false })
      .limit(5000);

    if (dealsError) {
      return NextResponse.json({ error: dealsError.message }, { status: 500 });
    }

    const runsBySource: Record<string, typeof recentRuns> = {};
    for (const run of recentRuns || []) {
      if (!runsBySource[run.source]) runsBySource[run.source] = [];
      runsBySource[run.source].push(run);
    }

    const proofBySource: Record<
      string,
      {
        activeRows: number;
        rowsWithPhotos: number;
        qualityTotal: number;
        lastSeenAt: string | null;
      }
    > = {};
    for (const row of activeDeals || []) {
      const id = row.source || "unknown";
      const proof =
        proofBySource[id] ||
        (proofBySource[id] = {
          activeRows: 0,
          rowsWithPhotos: 0,
          qualityTotal: 0,
          lastSeenAt: null,
        });
      const images = Array.isArray(row.images) ? row.images : [];
      proof.activeRows += 1;
      if (images.length > 0) proof.rowsWithPhotos += 1;
      proof.qualityTotal += gradeDataQuality({
        images,
        vin: row.vin,
        condition: row.condition,
        damageType: row.damage_type,
        mileage: row.mileage,
        locationCity: row.location_city,
        locationState: row.location_state,
        askPrice: row.ask_price,
        seller: row.seller,
        sellerType: row.seller_type,
        sourceUrl: row.source_url,
      }).score;
      if (!proof.lastSeenAt && row.last_seen_at) {
        proof.lastSeenAt = new Date(row.last_seen_at).toISOString();
      }
    }

    const health = sources.map((source) => {
      const runs = runsBySource[source.id] || [];
      const lastRun = runs[0];
      const totalRuns = runs.length;
      const failedRuns = runs.filter((r) => r.status === "error").length;
      const successRate =
        totalRuns > 0
          ? Math.round(((totalRuns - failedRuns) / totalRuns) * 100)
          : 100;
      const lastRunAt = lastRun?.completed_at
        ? new Date(lastRun.completed_at).toISOString()
        : null;
      const minutesSinceLastRun = lastRunAt
        ? Math.round((Date.now() - new Date(lastRunAt).getTime()) / 1000 / 60)
        : null;
      const proof = proofBySource[source.id];
      const readiness = !source.enabled
        ? source.requiresAuth
          ? "needs_login"
          : "disabled"
        : !lastRun
          ? source.requiresAuth
            ? "needs_login"
            : "needs_run"
          : lastRun.status === "error"
            ? "blocked"
            : proof?.activeRows
              ? "ready"
              : "no_rows";

      return {
        id: source.id,
        name: source.name,
        type: source.type,
        priority: source.priority,
        enabled: source.enabled,
        requiresAuth: source.requiresAuth,
        stealthRequired: source.stealthRequired,
        frequencyMinutes: source.frequencyMinutes,
        isDue:
          !minutesSinceLastRun ||
          minutesSinceLastRun >= source.frequencyMinutes,
        lastRunAt,
        lastStatus: lastRun?.status || "never_run",
        lastError: showInternalErrors ? lastRun?.error_message || null : null,
        totalRuns,
        failedRuns,
        successRate,
        estimatedDealsPerRun: source.estimatedDealsPerRun,
        readiness,
        activeRows: proof?.activeRows || 0,
        rowsWithPhotos: proof?.rowsWithPhotos || 0,
        averageQuality: proof?.activeRows
          ? Math.round(proof.qualityTotal / proof.activeRows)
          : 0,
        lastSeenAt: proof?.lastSeenAt || null,
      };
    });

    return NextResponse.json({
      total: sources.length,
      enabled: sources.filter((s) => s.enabled).length,
      due: health.filter((h) => h.isDue).length,
      healthy: health.filter((h) => h.successRate >= 80).length,
      sources: health,
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Health check failed" },
      { status: 500 },
    );
  }
}
