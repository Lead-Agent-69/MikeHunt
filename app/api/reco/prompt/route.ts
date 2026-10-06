export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { similarPrompt } from "@/lib/intelligence/affinity";
import { readUserSignals } from "@/lib/reco/signals";

// GET /api/reco/prompt — "Interested in similar?" for the signed-in user, or { prompt: null }.
// Asks only after PROMPT_MIN_DEALS distinct listings of one model were opened/saved/dwelled on in
// the last PROMPT_WINDOW_HOURS, and not again for PROMPT_COOLDOWN_DAYS once answered. The message
// cites the user's own views. No scarcity, no countdown. Answer with POST /api/reco/signal
// { kind: "interest_yes" | "interest_no", facet }.
export async function GET(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const rl = rateLimit(req, {
    key: "reco-prompt",
    limit: 30,
    windowMs: 60_000,
    identity: `user:${user.id}`,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const headers = { "Cache-Control": "private, no-store" };
  if (!isSupabaseConfigured())
    return NextResponse.json({ prompt: null }, { headers });
  const rows = await readUserSignals(createServerComponentClient(), user.id);
  return NextResponse.json({ prompt: similarPrompt(rows) }, { headers });
}
