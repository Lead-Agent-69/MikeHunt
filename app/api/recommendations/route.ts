export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { categorize } from "@/lib/discovery/categorize";
import { extractWinPatterns, matchWin } from "@/lib/intelligence/win-patterns";
import {
  extractInterestProfile,
  scoreInterest,
} from "@/lib/intelligence/interest-patterns";

// GET /api/recommendations — "Deals like your winners". Learns the make/models THIS dealer has
// profited on (from logged outcomes) and surfaces active deals matching those patterns. Sharpens as
// more sales are logged. $0 — no AI, no embeddings round-trip.
function mapDeal(d: any, reason?: string) {
  const tags = categorize({ ...d, sellBasis: d.deal_analysis?.sellBasis });
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    sellerPhone: d.seller_phone,
    sellerEmail: d.seller_email,
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin,
    mileage: d.mileage,
    condition: d.condition,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    dealVerdict: d.deal_verdict,
    locationCity: d.location_city,
    locationState: d.location_state,
    images: d.images || [],
    ...tags,
    alsoOn: [],
    listingCount: 1,
    winReason: reason,
  };
}

export async function GET() {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id) return NextResponse.json({ deals: [], reason: "sign in" });

  const supabase = createServerComponentClient();

  // 1) PROVEN-PROFIT patterns — what this dealer has actually made money on (logged outcomes). Sparse.
  const { data: outcomes } = await supabase
    .from("deal_outcomes")
    .select("make, model, actual_profit")
    .eq("user_id", user.id)
    .not("actual_profit", "is", null)
    .limit(200);
  const patterns = extractWinPatterns(outcomes || []);

  // 2) INTEREST patterns — what the dealer GRAVITATES to, from implicit behavior (saves≫watchlist≫views).
  //    Plentiful + immediate, so recommendations sharpen from day one, before profit outcomes exist.
  const [saved, watched, viewed] = await Promise.all([
    supabase
      .from("saved_cars")
      .select("deal_id, price_at_save, saved_at")
      .eq("user_id", user.id)
      .limit(300),
    supabase
      .from("watchlist")
      .select("deal_id, created_at")
      .eq("user_id", user.id)
      .limit(300),
    supabase
      .from("deal_views")
      .select("deal_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const now = Date.now();
  const weightById = new Map<string, number>();
  const priceById = new Map<string, number>();
  const newestAtById = new Map<string, number>(); // most-recent interaction ts per deal → recency decay
  const bump = (id: string | null, w: number, at?: string | null) => {
    if (!id) return;
    weightById.set(id, (weightById.get(id) || 0) + w);
    if (at) {
      const t = new Date(at).getTime();
      if (Number.isFinite(t))
        newestAtById.set(id, Math.max(newestAtById.get(id) || 0, t));
    }
  };
  for (const r of saved.data || []) {
    bump(r.deal_id, 3, (r as { saved_at?: string }).saved_at);
    if (r.deal_id && r.price_at_save)
      priceById.set(r.deal_id, Number(r.price_at_save));
  }
  for (const r of watched.data || [])
    bump(r.deal_id, 2, (r as { created_at?: string }).created_at);
  for (const r of viewed.data || [])
    bump(r.deal_id, 1, (r as { created_at?: string }).created_at);

  let interest = extractInterestProfile([]);
  if (weightById.size) {
    const { data: sig } = await supabase
      .from("deals")
      .select("id, make, model, ask_price, source")
      .in("id", Array.from(weightById.keys()));
    interest = extractInterestProfile(
      (sig || []).map((d: any) => ({
        make: d.make,
        model: d.model,
        price: priceById.get(d.id) ?? Number(d.ask_price) ?? null,
        source: d.source,
        weight: weightById.get(d.id) || 1,
        ageDays: newestAtById.has(d.id)
          ? (now - newestAtById.get(d.id)!) / 86_400_000
          : undefined,
      })),
    );
  }

  if (patterns.length === 0 && interest.patterns.length === 0) {
    return NextResponse.json({
      deals: [],
      reason: "save or sell a few deals to start learning your taste",
    });
  }

  // 3) Candidate pool = makes from BOTH signals.
  const makes = Array.from(
    new Set(
      [
        ...patterns.slice(0, 8).map((p) => p.make),
        ...interest.patterns.slice(0, 8).map((p) => p.make),
      ].filter(Boolean),
    ),
  );
  const { data: rows } = await supabase
    .from("deals")
    .select(
      "id, source, source_url, title, year, make, model, vin, mileage, condition, ask_price, sell_estimate, mmr_value, deal_analysis, profit_score, true_net_profit, recommended_max_bid, deal_verdict, location_city, location_state, images",
    )
    .eq("active", true)
    .gt("ask_price", 0)
    .in("make", makes)
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(500);

  // 4) Rank: proven-profit matches first (with the $ reason), then interest matches by affinity.
  const seen = new Set<string>();
  const scored: { deal: any; rank: number }[] = [];
  for (const r of rows || []) {
    if (seen.has(r.id)) continue;
    const w = matchWin(r.make, r.model, patterns);
    const iv = scoreInterest(
      {
        make: r.make,
        model: r.model,
        price: Number(r.ask_price),
        source: r.source,
      },
      interest,
    );
    if (!w.matched && iv.affinity < 0.35) continue; // must meaningfully match at least one signal
    seen.add(r.id);
    const reason = w.matched
      ? `you've averaged ~$${w.avgProfit.toLocaleString()} on ${w.count} like this`
      : iv.reason || "matches what you keep saving";
    // Proven profit outranks interest; stronger signal first within each tier.
    const rank = w.matched
      ? 1_000_000 + w.avgProfit
      : Math.round(iv.affinity * 1000);
    scored.push({ deal: mapDeal(r, reason), rank });
  }
  scored.sort((a, b) => b.rank - a.rank);

  return NextResponse.json({
    deals: scored.slice(0, 24).map((s) => s.deal),
    patterns: patterns.slice(0, 8),
    interest: interest.patterns.slice(0, 6),
  });
}
