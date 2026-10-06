// app/api/scrape/run/route.ts
// API endpoint to trigger scraper orchestration runs.

import { NextRequest, NextResponse } from "next/server";
import { denyUnauthed, scrapeSecret } from "@/lib/auth/scrape-gate";
import {
  buildBuyerScopeLinks,
  planScrapeForBuyerScope,
  resolveBuyerSourceRequest,
} from "@/lib/scrapers/buyer-scope";
import { buildImportContract } from "@/lib/scrapers/import-contract";
import { systemReadiness } from "@/lib/system-readiness";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import {
  enqueueScopedScrapeJob,
  isRemoteScrapeQueueEnabled,
} from "@/lib/scrapers/job-queue";
import {
  catalogForRunnerId,
  IMPLEMENTED_SCRAPER_IDS,
} from "@/lib/scrapers/source-index";
import {
  isAutomationAllowedSource,
  TOS_RESTRICTED_SOURCES,
} from "@/lib/scrapers/sweep-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type OrchestratorType =
  | "sequential"
  | "concurrent"
  | "priority"
  | "queue"
  | "realtime";

// Shared-secret gate lives in lib/auth/scrape-gate.ts — one implementation for every
// scraper-control route.

type SourceReadiness =
  | "ready"
  | "needs_login"
  | "blocked"
  | "no_rows"
  | "needs_run"
  | "not_configured"
  | "disabled";

function normalizeSourceId(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function sourceStatus(source: any): {
  readiness: SourceReadiness;
  action: string;
} {
  if (!source.enabled) {
    return source.requiresAuth
      ? {
          readiness: "needs_login",
          action: "Add source credentials before this source can run.",
        }
      : {
          readiness: "disabled",
          action: "Enable this source in the source registry.",
        };
  }

  if (source.requiresAuth) {
    return {
      readiness: "needs_login",
      action: "Add login/session credentials for this gated marketplace.",
    };
  }

  if (source.stealthRequired) {
    return {
      readiness: "needs_run",
      action:
        "Ready for a browser-assisted source search; verify rows, photos, and freshness after it finishes.",
    };
  }

  return {
    readiness: "needs_run",
    action:
      "Ready for an authorized scoped source search once data writes are unlocked.",
  };
}

function buildSourcePlan(sourceIds: string[] | undefined) {
  const implemented = new Set(IMPLEMENTED_SCRAPER_IDS);
  const disabled = new Set([
    "iaa",
    "acv",
    "adesa",
    "manheim",
    "facebook_marketplace",
    "vroom",
    "auto_discover",
  ]);
  const requiresAuth = new Set([
    "iaa",
    "acv",
    "adesa",
    "manheim",
    "facebook_marketplace",
  ]);
  const stealth = new Set([
    "iaa",
    "acv",
    "adesa",
    "manheim",
    "facebook_marketplace",
    "cars_com",
    "independent_dealer",
    "cargurus",
    "autotrader",
    "truecar",
    "curated_dealers",
    "offerup",
    "auto_discover",
  ]);
  const metaSources: Record<
    string,
    { name: string; type: string; estimate: number }
  > = {
    curated_dealers: {
      name: "Curated salvage/dealer network",
      type: "dealer",
      estimate: 200,
    },
    independent_dealer: {
      name: "Independent dealer network",
      type: "dealer",
      estimate: 100,
    },
    auto_discover: {
      name: "Auto Discover Dealer",
      type: "dealer",
      estimate: 20,
    },
  };
  const ids = sourceIds?.length ? sourceIds : [];
  const sources = ids.map((id) => {
    if (!implemented.has(id)) {
      return {
        id,
        name: id,
        type: "unknown",
        priority: "low",
        enabled: false,
        requiresAuth: false,
        stealthRequired: false,
        estimatedDealsPerRun: 0,
        readiness: "blocked" as SourceReadiness,
        runnable: false,
        action: "This source is not registered in the runner catalog.",
      };
    }
    const catalog = catalogForRunnerId(id);
    const meta = metaSources[id];
    const source = {
      id,
      name: meta?.name || catalog?.name || id,
      type: meta?.type || catalog?.type || "marketplace",
      priority:
        catalog?.priority === "P0"
          ? "high"
          : catalog?.priority === "P1"
            ? "medium"
            : "low",
      enabled: !disabled.has(id),
      requiresAuth: requiresAuth.has(id),
      stealthRequired: stealth.has(id),
      estimatedDealsPerRun: meta?.estimate || 100,
    };
    const status = sourceStatus(source);
    const termsOff =
      Boolean(TOS_RESTRICTED_SOURCES[source.id]) &&
      !isAutomationAllowedSource(source.id);
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      priority: source.priority,
      enabled: source.enabled,
      requiresAuth: source.requiresAuth,
      stealthRequired: source.stealthRequired,
      estimatedDealsPerRun: source.estimatedDealsPerRun,
      readiness: termsOff ? ("disabled" as SourceReadiness) : status.readiness,
      runnable:
        !termsOff &&
        source.enabled &&
        !source.requiresAuth &&
        status.readiness !== "disabled" &&
        status.readiness !== "blocked",
      action: termsOff
        ? "Off for site terms unless the operator opts in through SCRAPE_SOURCES."
        : status.action,
    };
  });
  const runnable = sources.filter((source) => source.runnable);
  return {
    sources,
    summary: {
      total: sources.length,
      runnable: runnable.length,
      heldBack: sources.length - runnable.length,
      estimatedDealsPerRun: runnable.reduce(
        (sum, source) => sum + (Number(source.estimatedDealsPerRun) || 0),
        0,
      ),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    // Auth before any plan. previewOnly used to return the source plan with no session,
    // and a signed-in session must not enqueue a scrape by itself.
    const denied = await denyUnauthed(request, {
      allowAdminSession: true,
      allowLocalhostUi: true,
    });
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const orchestrator: OrchestratorType = body.orchestrator || "concurrent";
    const smartPlan = body.scope ? planScrapeForBuyerScope(body.scope) : null;
    const requestedSourceIds: string[] | undefined =
      Array.isArray(body.sourceIds) && body.sourceIds.length
        ? body.sourceIds.map(normalizeSourceId).filter(Boolean)
        : smartPlan?.sourceIds;
    const resolvedRequest =
      smartPlan && requestedSourceIds
        ? resolveBuyerSourceRequest(requestedSourceIds, smartPlan.sourceIds)
        : null;
    const sourceIds: string[] | undefined = smartPlan
      ? resolvedRequest?.sourceIds || smartPlan.sourceIds
      : requestedSourceIds;
    const mismatchedSourceIds = resolvedRequest?.mismatchedSourceIds || [];
    const dealerSourceIds = Array.from(
      new Set([
        ...(resolvedRequest?.dealerSourceIds || []),
        ...((smartPlan?.scope.dealerSourceIds || []) as string[]),
      ]),
    );
    const links = smartPlan
      ? buildBuyerScopeLinks({
          ...smartPlan.scope,
          dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
        })
      : null;
    const concurrency: number = Math.min(
      Math.max(1, Number(body.concurrency || 2)),
      Math.max(1, sourceIds?.length || 3),
    );
    const dryRun: boolean = body.dryRun || false;
    const previewOnly: boolean = body.previewOnly || false;
    const readiness = systemReadiness();
    const importGates = readiness.items.filter((item) =>
      ["supabase", "service-role", "scrape-control"].includes(item.id),
    );
    const blockers = importGates.filter((item) => item.status !== "ready");
    const scraperControlReady = Boolean(scrapeSecret());
    const sourcePlan = buildSourcePlan(sourceIds);
    if (mismatchedSourceIds.length) {
      const mismatched = buildSourcePlan(mismatchedSourceIds).sources.map(
        (source) => ({
          ...source,
          readiness: "blocked" as SourceReadiness,
          runnable: false,
          estimatedDealsPerRun: 0,
          action:
            "Skipped because this source does not match the selected buyer lane.",
        }),
      );
      sourcePlan.sources.push(...mismatched);
      const runnable = sourcePlan.sources.filter((source) => source.runnable);
      sourcePlan.summary.total = sourcePlan.sources.length;
      sourcePlan.summary.runnable = runnable.length;
      sourcePlan.summary.heldBack =
        sourcePlan.summary.total - sourcePlan.summary.runnable;
      sourcePlan.summary.estimatedDealsPerRun = runnable.reduce(
        (sum, source) => sum + (Number(source.estimatedDealsPerRun) || 0),
        0,
      );
    }

    if (previewOnly) {
      const runnable = sourcePlan.sources.filter((source) => source.runnable);
      return NextResponse.json({
        ok: true,
        previewOnly: true,
        plan: smartPlan,
        contract: buildImportContract({
          plan: smartPlan,
          links,
          sourceIds: sourceIds || [],
          runnableCount: runnable.length,
          heldBackCount: sourcePlan.sources.length - runnable.length,
          mismatchedSourceIds,
          dealerSourceIds,
          canImport: false,
        }),
        links,
        nextActions: links
          ? {
              scan: links.scanHref,
              reviewFreshRows: links.proofRankedHref,
              verifySources: links.sourceSetupHref,
            }
          : undefined,
        sourceIds,
        requestedSourceIds,
        mismatchedSourceIds,
        dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
        concurrency,
        message: "Smart scrape preview generated. No scraper was started.",
      });
    }

    if (!sourceIds?.length) {
      return NextResponse.json(
        {
          ok: false,
          code: "NO_MATCHING_SOURCES",
          plan: smartPlan,
          contract: buildImportContract({
            plan: smartPlan,
            links,
            sourceIds: [],
            runnableCount: 0,
            heldBackCount: sourcePlan.sources.length,
            mismatchedSourceIds,
            dealerSourceIds,
            canImport: false,
          }),
          links,
          nextActions: links
            ? {
                scan: links.scanHref,
                reviewFreshRows: links.proofRankedHref,
                verifySources: links.sourceSetupHref,
              }
            : undefined,
          sourceIds,
          requestedSourceIds,
          mismatchedSourceIds,
          dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
          sources: sourcePlan.sources,
          summary: sourcePlan.summary,
          message:
            "No requested source matches the selected buyer lane, so no scraper was started.",
        },
        { status: 422 },
      );
    }

    if (blockers.length > 0 || !scraperControlReady) {
      const runnable = sourcePlan.sources.filter((source) => source.runnable);
      return NextResponse.json(
        {
          ok: false,
          code: "IMPORTS_LOCKED",
          plan: smartPlan,
          contract: buildImportContract({
            plan: smartPlan,
            links,
            sourceIds: sourceIds || [],
            runnableCount: runnable.length,
            heldBackCount: sourcePlan.sources.length - runnable.length,
            mismatchedSourceIds,
            dealerSourceIds,
            canImport: false,
          }),
          links,
          nextActions: links
            ? {
                scan: links.scanHref,
                reviewFreshRows: links.proofRankedHref,
                verifySources: links.sourceSetupHref,
              }
            : undefined,
          sourceIds,
          requestedSourceIds,
          mismatchedSourceIds,
          dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
          concurrency,
          sources: sourcePlan.sources,
          summary: sourcePlan.summary,
          gates: importGates.map((item) => ({
            id: item.id,
            label: item.label,
            status: item.status,
            nextStep: item.nextStep,
            actionLabel: item.actionLabel,
            verifyPath: item.verifyPath,
          })),
          message:
            blockers[0]?.nextStep ||
            "Scraper control needs Supabase and a shared secret before imports can run.",
        },
        { status: 424 },
      );
    }

    const queueEnabled = isRemoteScrapeQueueEnabled();

    const scopedRunScope = smartPlan
      ? {
          ...smartPlan.scope,
          dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
        }
      : undefined;

    if (queueEnabled && scopedRunScope) {
      const {
        data: { user },
      } = await getServerUser();
      const runnableSourceIds = sourcePlan.sources
        .filter((source) => source.runnable)
        .map((source) => source.id);
      if (!runnableSourceIds.length) {
        return NextResponse.json(
          {
            ok: false,
            queued: false,
            error:
              "No terms-safe runnable sources for this plan. Restricted marketplaces stay off unless SCRAPE_SOURCES opts in.",
            sourcePlan,
            sourceIds: sourceIds || [],
            heldBackSourceIds: (sourceIds || []).filter(
              (id) => !runnableSourceIds.includes(id),
            ),
          },
          { status: 422 },
        );
      }
      const queued = await enqueueScopedScrapeJob(
        createServerComponentClient(),
        {
          requestedBy: user?.id || null,
          sourceIds: runnableSourceIds,
          scope: scopedRunScope,
          orchestrator,
          concurrency,
          dryRun,
        },
      );
      return NextResponse.json(
        {
          ok: true,
          queued: true,
          deduplicated: queued.deduplicated,
          job: {
            id: queued.job.id,
            status: queued.job.status,
            createdAt: queued.job.created_at,
          },
          plan: smartPlan,
          contract: buildImportContract({
            plan: smartPlan,
            links,
            sourceIds,
            runnableCount: sourcePlan.sources.filter(
              (source) => source.runnable,
            ).length,
            heldBackCount: sourcePlan.sources.filter(
              (source) => !source.runnable,
            ).length,
            mismatchedSourceIds,
            dealerSourceIds,
            canImport: true,
          }),
          links,
          nextActions: links
            ? {
                scan: links.scanHref,
                reviewFreshRows: links.proofRankedHref,
                verifySources: links.sourceSetupHref,
              }
            : undefined,
          sourceIds,
          dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
          message: queued.deduplicated
            ? "Your existing scoped source search is still in progress."
            : "Scoped source search queued for the browser worker.",
        },
        { status: 202 },
      );
    }

    // Keep Playwright and the source implementations out of the Vercel queue bundle. The direct
    // path is used by local development only; production imports are claimed by Docker.
    const { runScrapers } = await import("@/lib/scrapers/runner");
    const results = await runScrapers({
      orchestrator,
      sourceIds,
      scope: scopedRunScope,
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
      contract: buildImportContract({
        plan: smartPlan,
        links,
        sourceIds: sourceIds || [],
        runnableCount: sourcePlan.sources.filter((source) => source.runnable)
          .length,
        heldBackCount: sourcePlan.sources.filter((source) => !source.runnable)
          .length,
        mismatchedSourceIds,
        dealerSourceIds,
        canImport: true,
      }),
      scopeLimited: !!smartPlan,
      links,
      nextActions: links
        ? {
            scan: links.scanHref,
            reviewFreshRows: links.proofRankedHref,
            verifySources: links.sourceSetupHref,
          }
        : undefined,
      dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
      results,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Scraper run failed:", error);
    return NextResponse.json(
      {
        code: "SOURCE_SEARCH_UNAVAILABLE",
        message:
          "We couldn't start this source check. No broad search was started; please try again shortly.",
      },
      { status: 500 },
    );
  }
}
