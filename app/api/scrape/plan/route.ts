import { NextRequest, NextResponse } from "next/server";
import {
  buildBuyerScopeLinks,
  planScrapeForBuyerScope,
  resolveBuyerSourceRequest,
} from "@/lib/scrapers/buyer-scope";
import { buildImportContract } from "@/lib/scrapers/import-contract";
import { systemReadiness } from "@/lib/system-readiness";
import { scrapeSecret } from "@/lib/auth/scrape-gate";
import { catalogForRunnerId, hasScraper } from "@/lib/scrapers/source-index";

export const dynamic = "force-dynamic";

type SourceReadiness =
  | "ready"
  | "needs_login"
  | "blocked"
  | "no_rows"
  | "needs_run"
  | "not_configured"
  | "disabled";

type PlanningSource = {
  id: string;
  name: string;
  type: string;
  priority: string;
  enabled: boolean;
  requiresAuth: boolean;
  stealthRequired: boolean;
  estimatedDealsPerRun: number;
};

const RUNNER_META_SOURCES: Record<string, Omit<PlanningSource, "id">> = {
  curated_dealers: {
    name: "Selected dealer inventory",
    type: "dealer",
    priority: "medium",
    enabled: true,
    requiresAuth: false,
    stealthRequired: true,
    estimatedDealsPerRun: 200,
  },
  independent_dealer: {
    name: "Independent dealer inventory",
    type: "dealer",
    priority: "medium",
    enabled: false,
    requiresAuth: false,
    stealthRequired: true,
    estimatedDealsPerRun: 100,
  },
  auto_discover: {
    name: "Dealer discovery",
    type: "dealer",
    priority: "low",
    enabled: false,
    requiresAuth: false,
    stealthRequired: true,
    estimatedDealsPerRun: 0,
  },
};

// Planning must stay light enough for Vercel. The executable runner imports browser automation
// packages and belongs only in the authorized run path; this catalog answers which runners are
// eligible without loading a scraper or a browser dependency.
function planningSource(id: string): PlanningSource | undefined {
  const meta = RUNNER_META_SOURCES[id];
  if (meta) return { id, ...meta };

  const catalog = catalogForRunnerId(id);
  if (!catalog || !hasScraper(id)) return undefined;
  return {
    id,
    name: catalog.name,
    type: catalog.type,
    priority: catalog.priority,
    enabled: catalog.status === "active",
    requiresAuth: false,
    stealthRequired: Boolean(
      catalog.requiresProxy || catalog.requiresFlareSolverr,
    ),
    estimatedDealsPerRun: 100,
  };
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const plan = planScrapeForBuyerScope(body.scope || body);
    const requested: string[] = Array.isArray(body.sourceIds)
      ? body.sourceIds.map(normalizeSourceId).filter(Boolean)
      : plan.sourceIds;
    const resolved = requested.length
      ? resolveBuyerSourceRequest(requested, plan.sourceIds)
      : {
          sourceIds: plan.sourceIds,
          mismatchedSourceIds: [] as string[],
          dealerSourceIds: [] as string[],
        };
    const sourceIds = resolved.sourceIds;
    const mismatchedSourceIds = resolved.mismatchedSourceIds;
    const dealerSourceIds = Array.from(
      new Set([
        ...resolved.dealerSourceIds,
        ...((plan.scope.dealerSourceIds || []) as string[]),
      ]),
    );
    const scopedLinks = buildBuyerScopeLinks({
      ...plan.scope,
      dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
    });
    const readiness = systemReadiness();
    const importGates = readiness.items.filter((item) =>
      ["supabase", "service-role", "scrape-control"].includes(item.id),
    );
    const blockers = importGates.filter((item) => item.status !== "ready");
    const scraperControlReady = Boolean(scrapeSecret());

    const sources = [
      ...sourceIds.map((id) => {
        const source = planningSource(id);
        if (!source) {
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
        const status = sourceStatus(source);
        return {
          id: source.id,
          name: source.name,
          type: source.type,
          priority: source.priority,
          enabled: source.enabled,
          requiresAuth: source.requiresAuth,
          stealthRequired: source.stealthRequired,
          estimatedDealsPerRun: source.estimatedDealsPerRun,
          readiness: status.readiness,
          runnable:
            source.enabled &&
            !source.requiresAuth &&
            status.readiness !== "disabled" &&
            status.readiness !== "blocked",
          action: status.action,
        };
      }),
      ...mismatchedSourceIds.map((id) => ({
        id,
        name: planningSource(id)?.name || id,
        type: planningSource(id)?.type || "unknown",
        priority: planningSource(id)?.priority || "low",
        enabled: false,
        requiresAuth: Boolean(planningSource(id)?.requiresAuth),
        stealthRequired: Boolean(planningSource(id)?.stealthRequired),
        estimatedDealsPerRun: 0,
        readiness: "blocked" as SourceReadiness,
        runnable: false,
        action:
          "Skipped because this source does not match the selected buyer lane.",
      })),
    ];

    const runnable = sources.filter((source: any) => source.runnable);
    const heldBack = sources.filter((source: any) => !source.runnable);
    const canImport =
      blockers.length === 0 && scraperControlReady && runnable.length > 0;
    const contract = buildImportContract({
      plan,
      links: scopedLinks,
      sourceIds,
      runnableCount: runnable.length,
      heldBackCount: heldBack.length,
      mismatchedSourceIds,
      dealerSourceIds,
      canImport,
    });

    return NextResponse.json({
      ok: true,
      plan,
      contract,
      links: scopedLinks,
      nextActions: {
        scan: scopedLinks.scanHref,
        reviewFreshRows: scopedLinks.proofRankedHref,
        verifySources: scopedLinks.sourceSetupHref,
      },
      sourceIds,
      requestedSourceIds: requested.length ? requested : undefined,
      mismatchedSourceIds,
      dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
      canImport,
      scraperControlReady,
      gates: importGates.map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        nextStep: item.nextStep,
        actionLabel: item.actionLabel,
      })),
      sources,
      summary: {
        total: sources.length,
        runnable: runnable.length,
        heldBack: heldBack.length,
        estimatedDealsPerRun: runnable.reduce(
          (sum: number, source: any) =>
            sum + (Number(source.estimatedDealsPerRun) || 0),
          0,
        ),
        firstBlocker: blockers[0]?.nextStep || null,
      },
      message: canImport
        ? `Ready to run ${runnable.length} matching source${runnable.length === 1 ? "" : "s"}.`
        : blockers[0]?.nextStep
          ? `Import is planned but locked: ${blockers[0].nextStep}`
          : runnable.length
            ? "Matching sources are planned, but scraper control is not ready."
            : "No matching source is runnable yet. Check held-back source actions.",
    });
  } catch (error) {
    console.error("Could not create scoped source plan:", error);
    return NextResponse.json(
      {
        ok: false,
        code: "SOURCE_PLAN_UNAVAILABLE",
        message:
          "We couldn't check matching sources right now. Your buying criteria are still saved; please try again shortly.",
      },
      { status: 500 },
    );
  }
}
