import { NextRequest, NextResponse } from "next/server";
import {
  hasRadiusCollectionScope,
  radiusRefreshMessage,
} from "@/lib/search/nearby-search-draft";
import { getServerUser } from "@/lib/server-supabase";
import { createServerComponentClient } from "@/lib/supabase";
import { internalError } from "@/lib/api/http-error";
import { rateLimit } from "@/lib/rate-limit";
import { US_STATES } from "@/lib/geo";
import {
  planScrapeForBuyerScope,
  resolveBuyerSourceRequest,
} from "@/lib/scrapers/buyer-scope";
import { CI_CANDIDATE_SOURCES } from "@/lib/scrapers/ci-sources";
import { isAutomationAllowedSource } from "@/lib/scrapers/sweep-schedule";
import {
  enqueueScopedScrapeJob,
  isRemoteScrapeQueueEnabled,
} from "@/lib/scrapers/job-queue";

export const dynamic = "force-dynamic";

/** Buyer requests can enqueue bounded jobs, never execute scrapers or configure runners. */
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json(
        { error: "Open this search in MIKEHUNT and try again." },
        { status: 403 },
      );
    const {
      data: { user },
    } = await getServerUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to find new matches." },
        { status: 401 },
      );
    const limit = rateLimit(request, {
      key: "buyer-source-request",
      identity: user.id,
      limit: 3,
      windowMs: 10 * 60_000,
    });
    if (!limit.allowed)
      return NextResponse.json(
        {
          error:
            "Please wait before requesting another search. Your existing matches are still available.",
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    if (!isRemoteScrapeQueueEnabled())
      return NextResponse.json(
        {
          error:
            "New-match searches are temporarily unavailable. You can still browse saved inventory.",
        },
        { status: 503 },
      );
    const body = await request.json().catch(() => null);
    if (
      !body?.scope ||
      typeof body.scope !== "object" ||
      Array.isArray(body.scope)
    )
      return NextResponse.json(
        { error: "Choose a location and search criteria first." },
        { status: 400 },
      );
    if (hasRadiusCollectionScope(body.scope))
      return NextResponse.json(
        { error: radiusRefreshMessage },
        { status: 400 },
      );
    const plan = planScrapeForBuyerScope(body.scope);
    const states = Array.from(
      new Set([plan.scope.state, ...(plan.scope.states || [])].filter(Boolean)),
    );
    if (
      !states.length ||
      states.length > 3 ||
      states.some((state) => ![...US_STATES, "DC"].includes(state!))
    )
      return NextResponse.json(
        { error: "Choose up to three states to look for new matches." },
        { status: 400 },
      );
    if (body.sourceIds !== undefined && !Array.isArray(body.sourceIds))
      return NextResponse.json(
        { error: "Choose the sources for this search again." },
        { status: 400 },
      );
    const requested = Array.isArray(body.sourceIds)
      ? body.sourceIds
      : plan.sourceIds;
    if (
      requested.length > 20 ||
      requested.some((id: unknown) => typeof id !== "string")
    )
      return NextResponse.json(
        { error: "Choose the sources for this search again." },
        { status: 400 },
      );
    const resolved = resolveBuyerSourceRequest(requested, plan.sourceIds);
    if (resolved.mismatchedSourceIds.length)
      return NextResponse.json(
        {
          error:
            "The selected sources do not match your search. Choose compatible sources and try again.",
        },
        { status: 422 },
      );
    const allowed = new Set<string>(CI_CANDIDATE_SOURCES);
    const sourceIds = resolved.sourceIds.filter(
      (id) => allowed.has(id) && isAutomationAllowedSource(id),
    );
    if (!sourceIds.length)
      return NextResponse.json(
        {
          error:
            "These sources cannot be refreshed right now. Existing inventory remains available.",
        },
        { status: 422 },
      );
    const scope = {
      ...plan.scope,
      dealerSourceIds: Array.from(
        new Set([
          ...(plan.scope.dealerSourceIds || []),
          ...resolved.dealerSourceIds,
        ]),
      ),
    };
    const queued = await enqueueScopedScrapeJob(createServerComponentClient(), {
      requestedBy: user.id,
      sourceIds,
      scope,
      orchestrator: "concurrent",
      concurrency: 2,
      dryRun: false,
    });
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
        message: queued.deduplicated
          ? "Your matching-source search is already queued or running."
          : "Your matching-source search is queued. Existing cars remain available.",
      },
      { status: 202 },
    );
  } catch (error) {
    return internalError(
      "buyer-source-request",
      error,
      "We couldn't start this search. Please try again; existing cars remain available.",
    );
  }
}
