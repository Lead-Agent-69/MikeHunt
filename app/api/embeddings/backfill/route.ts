export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { createServerComponentClient } from "@/lib/supabase";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  backfillEmbeddings,
  hasEmbeddingProvider,
} from "@/lib/ai/deal-embeddings";

// /api/embeddings/backfill — cron-gated. Embeds a budgeted batch: deals with no vector, then deals
// whose embedded text changed, then pre-freshness vectors. Paced under the Gemini free tier and
// capped per PT day (EMBEDDING_DAILY_CAP, default 900 of the 1,000 RPD). No-ops cleanly without
// GOOGLE_GENERATIVE_AI_API_KEY; quota exhaustion returns success with quotaExhausted set.
// A 250-row production run can consume nearly the entire 300s function window.
// Keep scheduled work comfortably bounded and reserve time for writes, coverage
// queries, and a confirmed HTTP response.
const MAX_PER_RUN = 100;
const WORK_BUDGET_MS = 180_000;
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasEmbeddingProvider()) {
    return NextResponse.json({
      skipped: true,
      reason: "GOOGLE_GENERATIVE_AI_API_KEY not set",
    });
  }

  try {
    const requested = Number.parseInt(
      new URL(request.url).searchParams.get("limit") || "",
      10,
    );
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_PER_RUN, Math.max(1, requested))
      : MAX_PER_RUN;
    const supabase = createServerComponentClient();
    const result = await backfillEmbeddings(supabase, limit, {
      timeBudgetMs: WORK_BUDGET_MS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return internalError("embeddings:backfill", e);
  }
}
