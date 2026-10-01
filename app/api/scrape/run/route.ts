// app/api/scrape/run/route.ts
// API endpoint to trigger scraper orchestration runs.

import { NextRequest, NextResponse } from "next/server";
import { runScrapers, OrchestratorType } from "@/lib/scrapers/runner";
import { denyUnauthed } from "@/lib/auth/scrape-gate";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Shared-secret gate lives in lib/auth/scrape-gate.ts — one implementation for every
// scraper-control route.

export async function POST(request: NextRequest) {
  const denied = await denyUnauthed(request, { allowAdminSession: true });
  if (denied) return denied;
  try {
    const body = await request.json();
    const orchestrator: OrchestratorType = body.orchestrator || "concurrent";
    const smartPlan = body.scope ? planScrapeForBuyerScope(body.scope) : null;
    const sourceIds: string[] | undefined =
      Array.isArray(body.sourceIds) && body.sourceIds.length
        ? body.sourceIds
        : smartPlan?.sourceIds;
    const concurrency: number = Math.min(
      Math.max(1, Number(body.concurrency || 2)),
      Math.max(1, sourceIds?.length || 3),
    );
    const dryRun: boolean = body.dryRun || false;
    const previewOnly: boolean = body.previewOnly || false;

    if (previewOnly) {
      return NextResponse.json({
        ok: true,
        previewOnly: true,
        plan: smartPlan,
        sourceIds,
        concurrency,
        message: "Smart scrape preview generated. No scraper was started.",
      });
    }

    const results = await runScrapers({
      orchestrator,
      sourceIds,
      concurrency,
      dryRun,
    });

    const summary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalDeals: results.reduce((sum, r) => sum + r.dealsFound, 0),
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      plan: smartPlan,
      scopeLimited: !!smartPlan,
      results,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Scraper run failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scraper run failed" },
      { status: 500 },
    );
  }
}
