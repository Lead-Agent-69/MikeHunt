export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import {
  categorize,
  auctionHeat,
  dealLane,
  LANE_COLORS,
} from "@/lib/discovery/categorize";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { cached } from "@/lib/cache";
import { valueConfidence } from "@/lib/valuation/confidence";

// /api/discover — the meta-search/aggregator endpoint (CarGurus/Kayak style).
// Pulls active deals, MERGES duplicates of the same car across sources by VIN (cheapest wins,
// other listings attached), grades each vs market, and groups into categorized rails.

function mapDeal(
  d: any,
  alsoOn: { source: string; askPrice: number; url: string }[],
) {
  const tags = categorize({ ...d, sellBasis: d.deal_analysis?.sellBasis });
  const { heat, hoursLeft } = auctionHeat(d.auction_end_at);
  // Channel/risk lane (auction/salvage/repairable/clean-retail/private) + its color, so the card can
  // show a lane chip and the per-lane rails below can group the same way the scan table does.
  const lane = dealLane(d);
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    lane,
    laneColor: LANE_COLORS[lane],
    // VIN-graph red flags (prior salvage / title-washing / rollback) — the moat, surfaced on the card.
    vinFlags: d.deal_analysis?.vinFlags as string[] | undefined,
    vinFlagSeverity: d.deal_analysis?.vinFlagSeverity as
      | "high"
      | "info"
      | undefined,
    sellerPhone: d.options?.contact?.phone,
    sellerEmail: d.options?.contact?.email,
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin,
    mileage: d.mileage,
    condition: d.condition,
    damageType: d.damage_type,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    // Honest confidence for the resale number, so the card shows whether it's comp-backed or a guess.
    valueConfidence: valueConfidence(
      d.deal_analysis?.sellBasis,
      d.deal_analysis?.soldAnchored,
    ),
    // Evidence count behind the number (real comps + sold) — surfaces the "backed by N" trust hint.
    valueEvidence:
      (d.deal_analysis?.valuation?.compCount ?? 0) +
      (d.deal_analysis?.valuation?.soldCount ?? 0),
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    dealVerdict: d.deal_verdict,
    locationCity: d.location_city,
    locationState: d.location_state,
    images: d.images || [],
    lastSeenAt: d.last_seen_at,
    firstSeenAt: d.first_seen_at,
    auctionEndAt: d.auction_end_at,
    heat,
    hoursLeft: hoursLeft != null ? Math.round(hoursLeft * 10) / 10 : null,
    // discovery tags
    ...tags,
    // cross-source merge ("also found on N sites")
    alsoOn,
    listingCount: alsoOn.length + 1,
    // Forward-looking forecast for the card chip (time-to-sell, urgency, price-drop odds).
    prediction: d.deal_analysis?.prediction,
  };
}

export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, {
      key: "discover",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) return tooManyRequests(rl);

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state")?.toUpperCase();
    // Multi-state scope (the user's chosen states) — `?states=MO,IL`. Falls back to single `?state`.
    const scopeStates = (searchParams.get("states")?.split(",") ?? [])
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const maxPrice = parseInt(searchParams.get("maxPrice") || "0");

    // Cache the expensive part — the 5k-row pull + cross-source VIN dedup + grading — by state for
    // 45s, so the main feed paints instantly on repeat loads. Personalization (For You) is rebuilt
    // per-request below from this cached, graded set (cheap), so it stays current.
    const { merged, rowCount } = await cached(
      `discover:${scopeStates.length ? scopeStates.join("-") : state || "all"}:${maxPrice || 0}`,
      45_000,
      async (): Promise<{ merged: any[]; rowCount: number }> => {
        const supabase = createServerComponentClient();
        // ONE index-driven pull via the discover_deals RPC. The old approach paged .range() up to 24k rows
        // across 24 round-trips — but the real cost was serializing 24k heavy rows (deal_analysis + options
        // JSONB) at ~10s. The RPC uses the idx_deals_last_seen_active partial index for the ORDER BY and caps
        // at 10k — verified to still cover all live sources (freshest 10k spans every one) — so it's ~2s, not
        // 18s. Returns one jsonb array (not row-capped by PostgREST). Cached 45s upstream.
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "discover_deals",
          {
            p_state: scopeStates.length ? null : (state ?? null),
            p_states: scopeStates.length ? scopeStates : null,
            p_max_price: maxPrice || 0,
            p_limit: 10000,
          },
        );
        if (rpcErr) throw new Error(rpcErr.message);
        const rows: any[] = Array.isArray(rpcData) ? rpcData : [];

        const byVin = new Map<string, any[]>();
        const noVin: any[] = [];
        for (const r of rows) {
          if (r.vin && String(r.vin).length === 17) {
            const k = String(r.vin).toUpperCase();
            if (!byVin.has(k)) byVin.set(k, []);
            byVin.get(k)!.push(r);
          } else {
            noVin.push(r);
          }
        }

        const m: any[] = [];
        byVin.forEach((group) => {
          group.sort((a, b) => Number(a.ask_price) - Number(b.ask_price));
          const [primary, ...rest] = group;
          m.push(
            mapDeal(
              primary,
              rest.map((r) => ({
                source: r.source,
                askPrice: Number(r.ask_price || 0),
                url: r.source_url,
              })),
            ),
          );
        });
        for (const r of noVin) m.push(mapDeal(r, []));
        return { merged: m, rowCount: rows.length };
      },
    );

    // ── Categorized rails ──
    const byGradeRank: Record<string, number> = {
      great: 3,
      good: 2,
      fair: 1,
      high: 0,
      unknown: -1,
    };
    // Rail depth — generous so a large category isn't silently truncated to a handful. The UI rail
    // scrolls horizontally, so a deeper list just means more to swipe through, not a heavier page.
    const N = 60;

    const best = merged
      .filter((d) => d.grade === "great" || d.grade === "good")
      .sort((a, b) => b.discountPct - a.discountPct)
      .slice(0, N);

    const trucksSuvs = merged
      .filter((d) => d.segment === "truck" || d.segment === "suv")
      .sort(
        (a, b) =>
          byGradeRank[b.grade] - byGradeRank[a.grade] ||
          b.discountPct - a.discountPct,
      )
      .slice(0, N);

    const luxury = merged
      .filter(
        (d) => d.luxury || d.segment === "coupe" || d.segment === "convertible",
      )
      .sort((a, b) => byGradeRank[b.grade] - byGradeRank[a.grade])
      .slice(0, N);

    const budget = merged
      .filter((d) => d.priceTier === "budget")
      .sort(
        (a, b) =>
          byGradeRank[b.grade] - byGradeRank[a.grade] ||
          b.discountPct - a.discountPct,
      )
      .slice(0, N);

    const roi = merged
      .filter((d) => d.dealVerdict === "go" || d.dealVerdict === "hold")
      .sort((a, b) => (b.profitScore || 0) - (a.profitScore || 0))
      .slice(0, N);

    const ev = merged.filter((d) => d.segment === "ev").slice(0, N);

    // Distressed-seller feed (Priceline Express Deal analog) — motivated sellers below market.
    const distressed = merged
      .filter((d) => d.distressed)
      .sort(
        (a, b) =>
          byGradeRank[b.grade] - byGradeRank[a.grade] ||
          b.discountPct - a.discountPct,
      )
      .slice(0, N);

    // Flash / Ending Soon (Booking urgency) — auctions closing within 24h, soonest first.
    const flash = merged
      .filter((d) => d.heat === "hot" || d.heat === "warm")
      .sort((a, b) => (a.hoursLeft ?? 1e9) - (b.hoursLeft ?? 1e9))
      .slice(0, N);

    const fresh = [...merged]
      .sort(
        (a, b) =>
          new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
      )
      .slice(0, N);

    // ── Channel lanes (the curated salvage-network payoff) — group by dealLane so a dealer can browse
    // the whole state by risk channel: branded/total-loss, fixable, and live auction lots, each sorted
    // best-deal-first. These only populate once the salvage/rebuilder sites are categorized correctly.
    const laneRail = (lane: string) =>
      merged
        .filter((d) => d.lane === lane)
        .sort(
          (a, b) =>
            byGradeRank[b.grade] - byGradeRank[a.grade] ||
            b.discountPct - a.discountPct,
        )
        .slice(0, N);
    const salvage = laneRail("salvage");
    const repairable = laneRail("repairable");
    const auctionLots = laneRail("auction");

    // ── Personalized "For You" rail (Booking/Kayak "your picks") ──
    // Reads the signed-in dealer's saved preferences — preferred states, budget, makes, min profit —
    // and surfaces matching deals first. Preferences were captured but never used; this wires them in.
    let forYou: any[] = [];
    let personalized = false;
    try {
      const {
        data: { user },
      } = await getServerUser();
      if (user?.id) {
        // Read the SAME table the app writes prefs to (user_profiles, via /api/profile + onboarding).
        const supabase = createServerComponentClient();
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("home_state, preferred_makes, budget_max, target_profit")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) {
          const homeState = (profile.home_state || "").toUpperCase();
          const makes = new Set<string>(
            (profile.preferred_makes || []).map((m: string) => m.toLowerCase()),
          );
          const maxPrice = Number(profile.budget_max) || 0;
          const minProfit = Number(profile.target_profit) || 0;
          const hasPrefs =
            !!homeState || makes.size > 0 || maxPrice > 0 || minProfit > 0;
          if (hasPrefs) {
            personalized = true;
            forYou = merged
              .filter((d) => {
                if (
                  homeState &&
                  (d.locationState || "").toUpperCase() !== homeState
                )
                  return false;
                if (makes.size > 0 && !makes.has((d.make || "").toLowerCase()))
                  return false;
                if (maxPrice > 0 && d.askPrice > maxPrice) return false;
                if (minProfit > 0 && (d.trueNetProfit || 0) < minProfit)
                  return false;
                return true;
              })
              .sort(
                (a, b) =>
                  byGradeRank[b.grade] - byGradeRank[a.grade] ||
                  (b.profitScore || 0) - (a.profitScore || 0),
              )
              .slice(0, N);
          }
        }
      }
    } catch {
      // Anonymous / no profile — just skip personalization, feed still works.
    }

    const rails = [
      ...(forYou.length > 0
        ? [
            {
              key: "foryou",
              title: "⭐ For You",
              subtitle: "Matched to your states, budget & profit target",
              deals: forYou,
            },
          ]
        : []),
      {
        key: "flash",
        title: "⏳ Ending Soon",
        subtitle: "Auctions closing within 24h",
        deals: flash,
      },
      {
        key: "best",
        title: "Best Deals",
        subtitle: "Biggest discounts vs market",
        deals: best,
      },
      {
        key: "distressed",
        title: "Motivated Sellers",
        subtitle: "Repos, estates & must-sells below market",
        deals: distressed,
      },
      {
        key: "roi",
        title: "Top Flips",
        subtitle: "Highest profit potential",
        deals: roi,
      },
      {
        key: "salvage",
        title: "🔴 Salvage",
        subtitle: "Branded / total-loss — salvage-yard & dealer supply",
        deals: salvage,
      },
      {
        key: "repairable",
        title: "🟠 Repairable",
        subtitle: "Rebuildable cars from the rebuilder network",
        deals: repairable,
      },
      {
        key: "auctionLots",
        title: "🟡 Auction Lots",
        subtitle: "Live auction inventory (Copart/IAA/ADESA & gov)",
        deals: auctionLots,
      },
      {
        key: "trucks",
        title: "Trucks & SUVs",
        subtitle: "Highest-demand segment",
        deals: trucksSuvs,
      },
      {
        key: "budget",
        title: "Under $10k",
        subtitle: "Best value buys",
        deals: budget,
      },
      {
        key: "luxury",
        title: "Luxury & Performance",
        subtitle: "Premium picks",
        deals: luxury,
      },
      { key: "ev", title: "Electric", subtitle: "EVs & hybrids", deals: ev },
      {
        key: "fresh",
        title: "Just Listed",
        subtitle: "Freshly scraped",
        deals: fresh,
      },
    ].filter((r) => r.deals.length > 0);

    return NextResponse.json({
      rails,
      totalListings: rowCount,
      uniqueVehicles: merged.length,
      mergedDuplicates: rowCount - merged.length,
      state: state || "nationwide",
      personalized,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
