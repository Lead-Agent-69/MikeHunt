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
const MAX_PER_RUN = 250;
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
    const limit = Math.min(
      MAX_PER_RUN,
      parseInt(new URL(request.url).searchParams.get("limit") || "250", 10) ||
        MAX_PER_RUN,
    );
    const supabase = createServerComponentClient();
    const result = await backfillEmbeddings(supabase, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return internalError("embeddings:backfill", e);
  }
}
