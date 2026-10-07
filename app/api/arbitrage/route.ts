export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { DealsService } from "@/lib/data/deals-service";
import { milesBetweenStates, transportCostForMiles } from "@/lib/geo";
import { getServerUser } from "@/lib/server-supabase";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { cached } from "@/lib/cache";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { discoverHomeState } from "@/lib/discovery/home-state";

// Geographic arbitrage from REAL data — no hardcoded regional price tables. For THIS dealer (home state
// read from their profile), every out-of-state deal is scored: would importing it pay off after the real
// road transport + a selling load? Tiered by haul distance so the surface works at every scale:
//   • LOCAL    — same state, no transport (buy + flip at home)
//   • REGIONAL — nearby states, short/cheap haul (the close, fast-turn money)
//   • NATIONAL — whole country, the biggest spreads worth a long haul
// Honest: a deal with no resale estimate, or one the engine already PASSed, is skipped — never guessed.

const SELL_COST_PCT = 0.09; // selling + recon-to-retail load, as a fraction of resale
const MIN_PROFIT = 1500; // worth a haul at all
const REGIONAL_MILES = 600; // "close" — neighbor states (state-centroid distance), a same/next-day haul

type Opp = {
  deal: any;
  arbitrage: {
    targetRegion: { state: string };
    sourceState: string;
    arbitrage: {
      sourcePrice: number;
      targetPrice: number;
      transportCost: number;
      potentialProfit: number;
      profitMargin: number;
      distance: number;
    };
  };
};

/** Empty dashboard: same shape the page already renders when there is nothing to show. */
export function emptyArbitragePayload(homeState: string, tailored = false) {
  return {
    homeState,
    tailored,
    summary: {
      local: 0,
      regional: 0,
      national: 0,
      regionalProfit: 0,
      nationalProfit: 0,
      bestProfit: 0,
    },
    topRoutes: [],
    localDeals: [],
    regionalArbitrage: [],
    nationalArbitrage: [],
  };
}

export async function GET(request: NextRequest) {
  try {
    // Param overrides saved home (view-another-base). Saved home matches Discover:
    // prefs.homeLocation (Settings/onboarding) wins over legacy user_profiles.home_state.
    const paramHome = (
      request.nextUrl.searchParams.get("homeState") || ""
    ).toUpperCase();
    let savedHome = "";
    let preferredMakes: Set<string> = new Set();
    if (isSupabaseConfigured()) {
      try {
        const {
          data: { user },
        } = await getServerUser();
        if (user?.id) {
          const sb = createServerComponentClient();
          const [{ data: profile }, { data: prefRow }] = await Promise.all([
            sb
              .from("user_profiles")
              .select("home_state, preferred_makes")
              .eq("id", user.id)
              .maybeSingle(),
            sb
              .from("user_preferences")
              .select("prefs")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);
          savedHome = discoverHomeState(
            (prefRow?.prefs as { homeLocation?: unknown } | null)?.homeLocation,
            profile?.home_state,
          );
          preferredMakes = new Set(
            (profile?.preferred_makes || []).map((m: string) =>
              String(m).toLowerCase(),
            ),
          );
        }
      } catch {
        /* anonymous — fall through to param/default */
      }
    }
    const tailored = !!savedHome;
    let homeState = paramHome || savedHome;

    // Arbitrage is resale spread math end to end: only a saved reseller / dealer desk gets it.
    // Signed-out, personal, diy, and parts callers get the empty shape, never the spreads.
    // Still surface their saved home so the page does not falsely say "set your home state".
    if (isSupabaseConfigured() && !(await resolveCallerFlipDesk())) {
      return NextResponse.json(
        {
          ...emptyArbitragePayload(homeState, tailored),
          flipOnly: true,
          deskAccess: "personal",
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        configured: false,
        ...emptyArbitragePayload(homeState, tailored),
      });
    }

    // CA is the last-resort default for anonymous visitors with no param and no saved home.
    if (!homeState) homeState = "CA";

    // Cache the per-home-state scan + scoring for 60s (the deal scan is the cost; the surface is the
    // same for a dealer base within that window).
    const payload = await cached(
      `arb:${homeState}:${Array.from(preferredMakes).sort().join(",")}`,
      60_000,
      async () => {
        const dealsService = new DealsService();
        // Scan the highest-profit inventory first (biggest base spreads = best arbitrage at any distance),
        // across a wide slice so close AND national opportunities both surface.
        const { deals } = await dealsService.getDeals({
          limit: 2500,
          sortBy: "profitEstimate",
          sortOrder: "desc",
        });

        const localDeals: any[] = [];
        const regional: Opp[] = [];
        const national: Opp[] = [];
        const routeAgg = new Map<
          string,
          { miles: number; cost: number; count: number; profit: number }
        >();

        for (const deal of deals) {
          const src = (deal.locationState || "").toUpperCase();
          if (!src) continue;
          if (src === homeState) {
            localDeals.push(deal);
            continue;
          }
          const ask = Number(deal.askPrice) || 0;
          const resale = Number(deal.sellEstimate) || 0;
          if (ask <= 0 || resale <= 0 || deal.dealVerdict === "pass") continue;

          const miles = milesBetweenStates(src, homeState);
          if (miles == null) continue;
          const transport = transportCostForMiles(miles);
          const sellingCost = Math.round(resale * SELL_COST_PCT);
          const potentialProfit = Math.round(
            resale - ask - transport - sellingCost,
          );
          if (potentialProfit < MIN_PROFIT) continue;

          const profitMargin = Math.round((potentialProfit / ask) * 100);
          const opp: Opp = {
            deal,
            arbitrage: {
              targetRegion: { state: homeState },
              sourceState: src,
              arbitrage: {
                sourcePrice: ask,
                targetPrice: resale,
                transportCost: transport,
                potentialProfit,
                profitMargin,
                distance: miles,
              },
            },
          };
          (miles <= REGIONAL_MILES ? regional : national).push(opp);

          const r = routeAgg.get(src) || {
            miles,
            cost: transport,
            count: 0,
            profit: 0,
          };
          r.count += 1;
          r.profit += potentialProfit;
          routeAgg.set(src, r);
        }

        // Sort each tier by profit, but float the dealer's preferred makes to the top of equal-ish deals.
        const rank = (o: Opp) =>
          o.arbitrage.arbitrage.potentialProfit +
          (preferredMakes.has((o.deal.make || "").toLowerCase()) ? 750 : 0);
        regional.sort((a, b) => rank(b) - rank(a));
        national.sort((a, b) => rank(b) - rank(a));

        const topRoutes = Array.from(routeAgg.entries())
          .map(([state, r]) => ({
            targetState: state,
            route: [state, homeState],
            distance: r.miles,
            estimatedCost: r.cost,
            estimatedTime: Math.max(1, Math.round(r.miles / 550)),
            opportunities: r.count,
            totalProfit: r.profit,
            regional: r.miles <= REGIONAL_MILES,
          }))
          .sort((a, b) => b.totalProfit - a.totalProfit)
          .slice(0, 8);

        const sumProfit = (arr: Opp[]) =>
          arr.reduce((s, o) => s + o.arbitrage.arbitrage.potentialProfit, 0);

        return {
          homeState,
          tailored,
          summary: {
            local: localDeals.length,
            regional: regional.length,
            national: national.length,
            regionalProfit: sumProfit(regional),
            nationalProfit: sumProfit(national),
            bestProfit: Math.max(
              0,
              regional[0]?.arbitrage.arbitrage.potentialProfit || 0,
              national[0]?.arbitrage.arbitrage.potentialProfit || 0,
            ),
          },
          topRoutes,
          localDeals: localDeals.slice(0, 50),
          regionalArbitrage: regional.slice(0, 25),
          nationalArbitrage: national.slice(0, 25),
        };
      },
    );
    return NextResponse.json(
      { ...payload, deskAccess: "flip" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: any) {
    console.error("Error fetching arbitrage dashboard data:", error);
    return internalError("arbitrage", error);
  }
}
