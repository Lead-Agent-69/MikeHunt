export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  backfillEmbeddings,
  hasEmbeddingProvider,
} from "@/lib/ai/deal-embeddings";

// /api/embeddings/backfill — cron-gated. Embeds a batch of deals that lack a vector so semantic
// similarity stays warm as new inventory arrives. No-ops cleanly without GOOGLE_GENERATIVE_AI_API_KEY.
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
      200,
      parseInt(new URL(request.url).searchParams.get("limit") || "100", 10) ||
        100,
    );
    const supabase = createServerComponentClient();
    const result = await backfillEmbeddings(supabase, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
