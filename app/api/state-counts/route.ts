export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createServerComponentClient } from "@/lib/supabase";
import { cached } from "@/lib/cache";

// GET /api/state-counts — live car inventory count per state, so the "My States" picker can show
// "Missouri · 2,450" (Netflix-style "what's available"). Cached 5 min; the numbers barely move.

async function countByState(
  table: string,
  col: string,
): Promise<Record<string, number>> {
  const sb = createServerComponentClient();
  const { data, error } = await sb.rpc("count_by_state", {
    p_table: table,
    p_col: col,
  });
  if (error || !Array.isArray(data)) return {};
  const out: Record<string, number> = {};
  for (const r of data as { state: string; n: number }[]) {
    if (r.state) out[String(r.state).toUpperCase()] = Number(r.n);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "state-counts",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const counts = await cached(`state-counts:cars`, 300_000, () =>
    countByState("deals", "location_state"),
  );
  return NextResponse.json({ vertical: "cars", counts });
}
