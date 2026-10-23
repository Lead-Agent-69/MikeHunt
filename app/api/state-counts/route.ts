export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createServerComponentClient } from "@/lib/supabase";
import { cached } from "@/lib/cache";
import { fetchAllRows } from "@/lib/db/paginate";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";

// GET /api/state-counts — live car inventory count per state, so the "My States" picker can show
// "Missouri · 2,450" (Netflix-style "what's available"). Cached 5 min; the numbers barely move.

async function countByState(): Promise<Record<string, number>> {
  const sb = createServerComponentClient();
  // Only one slim column, paginated past PostgREST's response cap. Never show a
  // silently truncated aggregate as the available inventory count.
  const data = await fetchAllRows<{ location_state: string | null }>(
    (from, to) =>
      applyBuyableInventory(
        sb.from("deals").select("location_state").eq("active", true),
      )
        .order("id", { ascending: true })
        .range(from, to),
    { max: 50_001 },
  );
  if (data.length > 50_000)
    throw new Error("Inventory count capacity exceeded");
  const out: Record<string, number> = {};
  for (const row of data) {
    const state = String(row.location_state || "").toUpperCase();
    if (/^[A-Z]{2}$/.test(state)) out[state] = (out[state] || 0) + 1;
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

  try {
    const counts = await cached(
      `state-counts:photo-fresh-cars`,
      300_000,
      countByState,
    );
    return NextResponse.json({ vertical: "cars", counts });
  } catch {
    return NextResponse.json(
      { error: "Inventory counts are temporarily unavailable", counts: {} },
      { status: 503 },
    );
  }
}
