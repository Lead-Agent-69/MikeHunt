export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createServerComponentClient } from "@/lib/supabase";
import { cached } from "@/lib/cache";
import {
  splitStateFreshness,
  type StateSplit,
} from "@/lib/deals/freshness-rollups";

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

// Active rows only, slim projection, paged. Null on error so the response keeps `counts` alone.
async function freshnessByState(): Promise<StateSplit | null> {
  const sb = createServerComponentClient();
  const rows: any[] = [];
  for (let page = 0; page < 30; page += 1) {
    const { data, error } = await sb
      .from("deals")
      .select(
        "location_state, source, source_url, last_seen_at, auction_end_at",
      )
      .eq("active", true)
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) return null;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return splitStateFreshness(rows);
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
  // `counts` is unchanged (picker compatibility). liveCounts / notLiveCounts split each state so a
  // state carried by frozen gated imports doesn't read as live inventory (eli audit 2026-10-09).
  const split = await cached(`state-counts:cars:freshness:v1`, 300_000, () =>
    freshnessByState(),
  );
  if (!split) return NextResponse.json({ vertical: "cars", counts });
  const liveCounts: Record<string, number> = {};
  const notLiveCounts: Record<string, number> = {};
  for (const [st, b] of Object.entries(split)) {
    liveCounts[st] = b.live;
    notLiveCounts[st] = b.frozen + b.stale + b.ended;
  }
  return NextResponse.json({
    vertical: "cars",
    counts,
    liveCounts,
    notLiveCounts,
    freshnessByState: split,
  });
}
