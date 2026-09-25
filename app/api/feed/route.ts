export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { cached } from "@/lib/cache";
import { buildInterestProfile } from "@/lib/intelligence/interest-profile";
import { scoreInterest } from "@/lib/intelligence/interest-patterns";

// GET /api/feed?offset=0&limit=12 — the full-screen TikTok-style stream. Active, in-stock, photo-having cars.
// SIGNED-IN users get a "For You" ranking: a taste-ranked pool (quality + interest affinity from their
// saves/watches/views) cached per user, paginated. ANON users get the plain best-first fresh feed. $0.

const COLS =
  "id, source, source_url, title, year, make, model, ask_price, sell_estimate, true_net_profit, profit_score, deal_verdict, location_city, location_state, images, mileage, condition, deal_analysis";

function mapItem(d: any) {
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    image: Array.isArray(d.images) ? d.images[0] : null,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : null,
    netProfit: d.true_net_profit != null ? Number(d.true_net_profit) : null,
    score: d.profit_score != null ? Number(d.profit_score) : null,
    verdict: d.deal_verdict,
    mileage: d.mileage,
    condition: d.condition,
    locationCity: d.location_city,
    locationState: d.location_state,
    prediction: d.deal_analysis?.prediction ?? null,
    forYouReason: undefined as string | undefined,
  };
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 12, 1), 30);
  // Multi-state scope: `?states=MO,IL` (the user's chosen states) or a single `?state=MO`. Empty = all.
  const scopeStates = (sp.get("states")?.split(",") ?? [sp.get("state")])
    .map((s) => s?.trim().toUpperCase())
    .filter((s): s is string => !!s);
  const scopeKey = scopeStates.length ? scopeStates.join("-") : "all";

  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await getServerUser();

  // ── FOR YOU (signed in): a taste-ranked pool, cached per user for 60s and paginated over. ──
  if (user?.id) {
    const ranked = await cached(
      `feed:${user.id}:${scopeKey}`,
      60_000,
      async () => {
        const profile = await buildInterestProfile(supabase, user.id);
        let q = supabase
          .from("deals")
          .select(COLS)
          .eq("active", true)
          .gt("ask_price", 0)
          .not("images", "is", null)
          .order("profit_score", { ascending: false, nullsFirst: false })
          .order("last_seen_at", { ascending: false })
          .limit(250);
        if (scopeStates.length === 1)
          q = q.eq("location_state", scopeStates[0]);
        else if (scopeStates.length > 1)
          q = q.in("location_state", scopeStates);
        const { data } = await q;
        const items = (data || [])
          .filter((d: any) => Array.isArray(d.images) && d.images[0])
          .map(mapItem);

        // Rank = deal quality (0-1) + taste affinity (weighted up so a strong match leads). The reason is
        // surfaced only for a real match so the card can say WHY it's for you.
        const scored = items.map((it) => {
          const { affinity, reason } = scoreInterest(
            {
              make: it.make,
              model: it.model,
              price: it.askPrice,
              source: it.source,
            },
            profile,
          );
          if (affinity >= 0.35) it.forYouReason = reason;
          return { it, rank: (it.score ?? 0) / 100 + affinity * 1.25 };
        });
        scored.sort((a, b) => b.rank - a.rank);
        return scored.map((s) => s.it);
      },
    );
    return NextResponse.json({
      items: ranked.slice(offset, offset + limit),
      nextOffset: offset + limit,
      personalized: true,
    });
  }

  // ── ANON: plain best-first, fresh, photo-only feed. ──
  let q = supabase
    .from("deals")
    .select(COLS)
    .eq("active", true)
    .gt("ask_price", 0)
    .not("images", "is", null)
    .order("profit_score", { ascending: false, nullsFirst: false })
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (scopeStates.length === 1) q = q.eq("location_state", scopeStates[0]);
  else if (scopeStates.length > 1) q = q.in("location_state", scopeStates);

  const { data, error } = await q;
  if (error)
    return NextResponse.json({
      items: [],
      nextOffset: offset,
      error: error.message,
    });

  const items = (data || [])
    .filter((d: any) => Array.isArray(d.images) && d.images[0])
    .map(mapItem);
  return NextResponse.json({ items, nextOffset: offset + limit });
}
