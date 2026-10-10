export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { DealsService } from "@/lib/data/deals-service";
import { milesBetweenStates } from "@/lib/geo";
import type { GeoPoint } from "@/lib/geo/buyer-distance";
import { resolveBuyerHome, type BuyerHome } from "@/lib/geo/buyer-home";
import { isLiveDeal, type FreshnessInput } from "@/lib/deals/freshness";
import { getServerUser } from "@/lib/server-supabase";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { cached } from "@/lib/cache";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import {
  isPlaceholderBid,
  MAX_HONEST_MARGIN_PCT,
  type ArbitrageExclusionReason,
} from "@/lib/deals/arbitrage-eligibility";
import {
  evaluateOpportunity,
  isExcluded,
  rankOpportunities,
  type ArbitrageComp,
  type ArbitrageListing,
  type ArbitrageOpportunity,
  type Spread,
} from "@/lib/arbitrage";

// Resale-profit finder (arbitrage v2) — for THIS buyer's sell market, every live listing is valued by
// the lib/arbitrage engine:
//   net = expectedResale − (ask + fees + transport + recon + repair + sellingCost)
// expectedResale comes only from real comps (sold same-state → sold national → ask same-state → ask
// national, n >= 3, title-lane matched). Each row carries May's 14-field `spread` contract. Rows the
// engine cannot value (fewer than 3 comps) are listed under needsComps with net / potentialProfit null
// and always rank after scored rows. Tiered by haul so the page keeps working:
//   • LOCAL    — same state as the buyer's home
//   • REGIONAL — nearby (<= REGIONAL_MILES)
//   • NATIONAL — whole country
// Holding / floorplan cost is NOT in net (listed in each row's `assumptions`).
// No saved home → no default state: needsHome: true, homeState: null, empty tiers.

const MIN_PROFIT = 1500; // worth a haul at all
const REGIONAL_MILES = 600; // "close" — a same/next-day haul
/** Comp pool: same make/model, model year within ± this many years of the listing. */
const COMP_YEAR_BAND = 1;
/** Sold comps older than this are not fetched (the engine also ages them out). */
const SOLD_COMP_WINDOW_DAYS = 180;
const PAGE = 1000;
/** Hard ceiling on comp rows per table so one request can never scan unbounded. */
const MAX_COMP_ROWS = 20_000;
/** Model names per IN() batch (keeps the PostgREST URL short). */
const MODEL_BATCH = 60;

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

// Stale / frozen / ended rows: lib/deals/freshness isLiveDeal (terms-gated imports older than the
// grace window, last seen > 72h, missing last_seen_at, or an ended auction are not a buyable price).
// Buyer home: lib/geo/buyer-home resolveBuyerHome (never a default state).

function stateCode(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(s) && s !== "NA" ? s : null;
}

// ─── Payload types ───────────────────────────────────────────────────────────────────────────────

type LegacyArb<P> = {
  sourcePrice: number;
  targetPrice: number | null;
  transportCost: number;
  potentialProfit: P;
  profitMargin: P;
  distance: number;
};

type RowExtras = {
  spread: Spread;
  status: ArbitrageOpportunity["status"];
  confidence: ArbitrageOpportunity["confidence"];
  assumptions: string[];
};

/** Listable but un-scorable: fewer than 3 comps, a placeholder bid, or an outlier margin. */
type NeedsCompsOpp = RowExtras & {
  deal: any;
  arbitrage: {
    targetRegion: { state: string };
    sourceState: string;
    excludedReason: ArbitrageExclusionReason | "needs_comps";
    arbitrage: LegacyArb<null>;
  };
};

type Opp = RowExtras & {
  deal: any;
  arbitrage: {
    targetRegion: { state: string };
    sourceState: string;
    arbitrage: LegacyArb<number> & { targetPrice: number };
  };
};

/** Empty dashboard: same shape the page already renders when there is nothing to show. */
export function emptyArbitragePayload(
  homeState: string | null,
  tailored = false,
) {
  return {
    homeState: homeState || null,
    tailored,
    needsHome: !homeState,
    summary: {
      local: 0,
      regional: 0,
      national: 0,
      regionalProfit: 0,
      nationalProfit: 0,
      bestProfit: 0,
      needsComps: 0,
      excluded: {
        unverified_comps: 0,
        placeholder_bid: 0,
        outlier_margin: 0,
        stale: 0,
      },
    },
    topRoutes: [],
    localDeals: [],
    regionalArbitrage: [],
    nationalArbitrage: [],
    needsComps: [],
    opportunities: [],
  };
}

// ─── Comps (batched) ─────────────────────────────────────────────────────────────────────────────

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
/** Same normalization as lib/scoring/market-value normalizeModel (not exported there):
 *  'F-150', 'f150', 'F 150' → 'f150'. */
export const normalizeModel = (model: unknown) =>
  String(model ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
const groupKey = (make: unknown, model: unknown) =>
  `${norm(make)}|${normalizeModel(model)}`;

/**
 * Sold rows often carry the trim inside the model (eBay: "F-150 XLT", "Camry SE"). Assign a sold row
 * to the candidate group whose normalized model is the LONGEST prefix of the row's normalized model
 * (same make). "f150xlt" → "f150"; "grandcherokee" never matches "cherokee" (not a prefix).
 */
export function soldGroupKey(
  modelsByMake: Map<string, string[]>,
  make: unknown,
  model: unknown,
): string | null {
  const mk = norm(make);
  const nm = normalizeModel(model);
  if (!mk || !nm) return null;
  for (const m of modelsByMake.get(mk) || []) {
    if (nm.startsWith(m)) return `${mk}|${m}`;
  }
  return null;
}

/** ILIKE prefix pattern tolerant of space/dash spelling: "F-150" → "F%150%". Only [A-Za-z0-9]
 *  reach the pattern, so no PostgREST or() quoting / LIKE escaping is needed. */
export function soldModelPattern(model: string): string | null {
  const tokens = model.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return tokens.length ? `${tokens.join("%")}%` : null;
}
const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
/** Spellings to send to IN() (exact match); matching afterwards is case-insensitive. */
const variants = (vals: readonly string[]) => {
  const out = new Set<string>();
  for (const v of vals) {
    const t = v.trim();
    if (!t) continue;
    out.add(t);
    out.add(t.toLowerCase());
    out.add(t.toUpperCase());
    out.add(titleCase(t));
  }
  return Array.from(out);
};

type AskRow = {
  id: string;
  source: string | null;
  source_deal_id: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  ask_price: number | string | null;
  condition: string | null;
  location_state: string | null;
  location_zip: string | null;
  lat: number | string | null;
  lng: number | string | null;
  last_seen_at: string | null;
  source_url: string | null;
  auction_end_at: string | null;
};

type SoldRow = {
  id: string | number;
  make: string | null;
  model: string | null;
  year: number | null;
  sold_price: number | string | null;
  location_state: string | null;
  title: string | null;
  sold_at: string | null;
};

export const COMP_ASK_COLUMNS =
  "id, source, source_deal_id, make, model, year, ask_price, condition, location_state, location_zip, lat, lng, last_seen_at, source_url, auction_end_at";
export const COMP_SOLD_COLUMNS =
  "id, make, model, year, sold_price, location_state, title, sold_at";

/**
 * One paginated query per table per batch of (up to MODEL_BATCH) model names — not per row.
 * Returns ask comps (active deals, kind "ask") and sold comps (sold_listings, kind "sold") keyed by
 * make|model, plus the active rows by id (for listing coordinates / source ids).
 */
async function loadComps(
  sb: ReturnType<typeof createServerComponentClient>,
  groups: Map<
    string,
    {
      make: string;
      model: string;
      spellings?: Set<string>;
      minYear: number;
      maxYear: number;
    }
  >,
  now: number,
): Promise<{
  byGroup: Map<string, ArbitrageComp[]>;
  activeById: Map<string, AskRow>;
  queries: number;
}> {
  const byGroup = new Map<string, ArbitrageComp[]>();
  const activeById = new Map<string, AskRow>();
  let queries = 0;
  const all = Array.from(groups.values());
  if (!all.length) return { byGroup, activeById, queries };
  const minYear = Math.min(...all.map((g) => g.minYear)) - COMP_YEAR_BAND;
  const maxYear = Math.max(...all.map((g) => g.maxYear)) + COMP_YEAR_BAND;
  const push = (k: string, c: ArbitrageComp) => {
    const arr = byGroup.get(k);
    if (arr) arr.push(c);
    else byGroup.set(k, [c]);
  };
  // make → normalized candidate models, longest first (for the sold prefix match).
  const modelsByMake = new Map<string, string[]>();
  for (const k of Array.from(groups.keys())) {
    const [mk, m] = k.split("|");
    if (!mk || !m) continue;
    modelsByMake.set(mk, [...(modelsByMake.get(mk) || []), m]);
  }
  modelsByMake.forEach((arr) => arr.sort((a, b) => b.length - a.length));
  const soldCutoff = new Date(
    now - SOLD_COMP_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  // Batch by model name; make is filtered too (exact spellings), then re-checked case-insensitively.
  const models = Array.from(
    new Set(all.flatMap((g) => Array.from(g.spellings || [g.model]))),
  );
  const makes = variants(Array.from(new Set(all.map((g) => g.make))));
  for (let i = 0; i < models.length; i += MODEL_BATCH) {
    const modelBatch = variants(models.slice(i, i + MODEL_BATCH));

    let askRows = 0;
    for (let from = 0; askRows < MAX_COMP_ROWS; from += PAGE) {
      queries += 1;
      const { data, error } = await sb
        .from("deals")
        .select(COMP_ASK_COLUMNS)
        .eq("active", true)
        .in("make", makes)
        .in("model", modelBatch)
        .gte("year", minYear)
        .lte("year", maxYear)
        .gt("ask_price", 0)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`ask comps: ${error.message}`);
      const rows = (data || []) as AskRow[];
      for (const r of rows) {
        activeById.set(String(r.id), r);
        const k = groupKey(r.make, r.model);
        if (!groups.has(k)) continue;
        // A stale/frozen ask is not market evidence either.
        if (!isLiveDeal(r, now)) continue;
        push(k, {
          kind: "ask",
          price: Number(r.ask_price) || 0,
          state: r.location_state,
          year: r.year,
          observedAt: r.last_seen_at,
          id: String(r.id),
          source: r.source,
          sourceDealId: r.source_deal_id,
          title: r.condition,
        });
      }
      askRows += rows.length;
      if (rows.length < PAGE) break;
    }

    // Sold: model prefix (trim-in-model rows), not an exact IN(); still one query per batch.
    const soldOr = Array.from(
      new Set(
        models
          .slice(i, i + MODEL_BATCH)
          .map(soldModelPattern)
          .filter((x): x is string => !!x),
      ),
    )
      .map((pat) => `model.ilike.${pat}`)
      .join(",");
    let soldRows = 0;
    for (let from = 0; soldRows < MAX_COMP_ROWS; from += PAGE) {
      queries += 1;
      const { data, error } = await sb
        .from("sold_listings")
        .select(COMP_SOLD_COLUMNS)
        .eq("currency_code", "USD")
        .eq("country_code", "US")
        .in("make", makes)
        .or(soldOr)
        .gte("year", minYear)
        .lte("year", maxYear)
        .gt("sold_price", 0)
        .gte("sold_at", soldCutoff)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      // Sold evidence is optional: without it the engine falls back to ask tiers (and says so).
      if (error) break;
      const rows = (data || []) as SoldRow[];
      for (const r of rows) {
        const k = soldGroupKey(modelsByMake, r.make, r.model);
        if (!k) continue;
        push(k, {
          kind: "sold",
          price: Number(r.sold_price) || 0,
          state: r.location_state,
          year: r.year,
          observedAt: r.sold_at,
          id: `sold:${r.id}`,
          // sold_listings.title is the source listing headline: lib/arbitrage soldTitleCategory reads
          // branded keywords / explicit clean-title claims from it and leaves the rest Unknown.
          title: r.title,
        });
      }
      soldRows += rows.length;
      if (rows.length < PAGE) break;
    }
  }
  return { byGroup, activeById, queries };
}

// ─── Route ───────────────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const paramHome = stateCode(request.nextUrl.searchParams.get("homeState"));
  try {
    // Param overrides saved home (view-another-base). Saved home: prefs.homeLocation wins over
    // legacy user_profiles columns; never a default state.
    let savedHome: BuyerHome | null = null;
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
              .select("home_state, home_zip, home_lat, home_lng")
              .eq("id", user.id)
              .maybeSingle(),
            sb
              .from("user_preferences")
              .select("prefs")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);
          savedHome = resolveBuyerHome({
            prefsHomeLocation: (
              prefRow?.prefs as { homeLocation?: unknown } | null
            )?.homeLocation,
            profile,
          });
        }
      } catch {
        /* anonymous — fall through to param / needsHome */
      }
    }
    const tailored = !!savedHome;
    const homeState: string | null = paramHome || savedHome?.state || null;

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
        { headers: NO_STORE },
      );
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { configured: false, ...emptyArbitragePayload(homeState, tailored) },
        { headers: NO_STORE },
      );
    }

    // No saved home and no param: no default state. The page keeps its "set your home state" path.
    if (!homeState) {
      return NextResponse.json(
        { ...emptyArbitragePayload(null, false), deskAccess: "flip" },
        { headers: NO_STORE },
      );
    }

    // Sell market: the saved home point when it is the market being viewed, else the param state.
    const sellMarket: GeoPoint =
      savedHome && savedHome.state === homeState
        ? savedHome
        : { state: homeState };
    const marketKey = [
      homeState,
      sellMarket.zip || "",
      sellMarket.lat != null ? Number(sellMarket.lat).toFixed(2) : "",
      sellMarket.lng != null ? Number(sellMarket.lng).toFixed(2) : "",
    ].join(":");

    const payload = await cached(`arb2:${marketKey}`, 60_000, async () => {
      const now = Date.now();
      const dealsService = new DealsService();
      // PostgREST caps a single page at 1000 rows; cap explicitly.
      const { deals } = await dealsService.getDeals({
        limit: 1000,
        sortBy: "profitEstimate",
        sortOrder: "desc",
      });

      const excluded: Record<ArbitrageExclusionReason | "stale", number> = {
        unverified_comps: 0,
        placeholder_bid: 0,
        outlier_margin: 0,
        stale: 0,
      };

      // 1) Candidates: live, priced, not engine-PASSed.
      const candidates: any[] = [];
      for (const deal of deals as any[]) {
        const src = String(deal.locationState || "").toUpperCase();
        if (!src) continue;
        if (!isLiveDeal(deal, now)) {
          excluded.stale += 1;
          continue;
        }
        if (deal.dealVerdict === "pass") continue;
        candidates.push(deal);
      }

      // 2) Batched comp fetch: one paginated query per table per MODEL_BATCH model names.
      const groups = new Map<
        string,
        {
          make: string;
          model: string;
          spellings: Set<string>;
          minYear: number;
          maxYear: number;
        }
      >();
      for (const d of candidates) {
        if (!d.make || !d.model) continue;
        const k = groupKey(d.make, d.model);
        const y = Number(d.year) || 0;
        const g = groups.get(k);
        if (!g)
          groups.set(k, {
            make: String(d.make),
            model: String(d.model),
            spellings: new Set([String(d.model)]),
            minYear: y || 1900,
            maxYear: y || new Date(now).getFullYear() + 1,
          });
        else {
          g.spellings.add(String(d.model));
          if (!y) continue;
          g.minYear = Math.min(g.minYear, y);
          g.maxYear = Math.max(g.maxYear, y);
        }
      }
      const sb = createServerComponentClient();
      const { byGroup, activeById, queries } = await loadComps(sb, groups, now);

      // 3) Evaluate each candidate with the engine.
      const localDeals: any[] = [];
      const evaluated: { opp: ArbitrageOpportunity; deal: any; src: string }[] =
        [];
      for (const deal of candidates) {
        const src = String(deal.locationState).toUpperCase();
        const raw = activeById.get(String(deal.id));
        const toIso = (v: unknown) =>
          v instanceof Date ? v.toISOString() : ((v as string | null) ?? null);
        // Freshness fields ride along so the engine's isStale (isLiveDeal) sees ended auctions and
        // gated source URLs too.
        const listing: ArbitrageListing & FreshnessInput = {
          id: String(deal.id),
          sourceUrl: deal.sourceUrl ?? raw?.source_url ?? null,
          auctionEndAt: toIso(deal.auctionEndAt ?? raw?.auction_end_at),
          ask: Number(deal.askPrice) || null,
          source: deal.source,
          sourceDealId: raw?.source_deal_id ?? null,
          title: deal.condition,
          damageType: deal.damageType,
          location: {
            state: src,
            zip: raw?.location_zip ?? deal.locationZip ?? null,
            lat: raw?.lat ?? null,
            lng: raw?.lng ?? null,
          },
          lastSeenAt: toIso(deal.lastSeenAt),
        };
        const y = Number(deal.year) || null;
        const pool = (
          byGroup.get(groupKey(deal.make, deal.model)) || []
        ).filter(
          (c) =>
            y == null ||
            c.year == null ||
            Math.abs(Number(c.year) - y) <= COMP_YEAR_BAND,
        );
        const r = evaluateOpportunity(listing, pool, {
          sellMarket,
          now,
          isStale: (row) => !isLiveDeal(row as FreshnessInput, now),
        });
        if (isExcluded(r)) {
          if (r.reason === "stale") excluded.stale += 1;
          continue;
        }
        if (src === homeState) {
          // Local tier keeps its raw-deal shape (page reads deal fields); spread rides along.
          localDeals.push({
            ...deal,
            spread: r.spread,
            arbitrageStatus: r.status,
          });
          continue;
        }
        evaluated.push({ opp: r, deal, src });
      }

      // 4) Rank with the engine (scored by confidence-weighted net, needs-comps after, no profit).
      const ranked = rankOpportunities(evaluated.map((e) => e.opp));
      const byId = new Map(evaluated.map((e) => [e.opp.id, e]));

      const regional: Opp[] = [];
      const national: Opp[] = [];
      const needsComps: NeedsCompsOpp[] = [];
      const routeAgg = new Map<
        string,
        { miles: number; cost: number; count: number; profit: number }
      >();

      for (const opp of ranked) {
        const { deal, src } = byId.get(opp.id)!;
        const miles = opp.distance.miles ?? milesBetweenStates(src, homeState);
        if (miles == null) continue;
        const s = opp.spread;
        const extras: RowExtras = {
          spread: s,
          status: opp.status,
          confidence: opp.confidence,
          assumptions: opp.assumptions,
        };
        const base = {
          targetRegion: { state: homeState },
          sourceState: src,
        };
        const toNeeds = (why: ArbitrageExclusionReason | "needs_comps") => {
          if (why !== "needs_comps") excluded[why] += 1;
          needsComps.push({
            deal,
            ...extras,
            // A placeholder/outlier row never shows a net, even when comps exist.
            spread: { ...s, net: null },
            arbitrage: {
              ...base,
              excludedReason: why,
              arbitrage: {
                sourcePrice: s.ask,
                targetPrice: s.expectedResale,
                transportCost: s.transport,
                potentialProfit: null,
                profitMargin: null,
                distance: miles,
              },
            },
          });
        };

        if (opp.status === "needs_comps") {
          toNeeds("needs_comps");
          continue;
        }
        const net = opp.profit;
        const profitMargin = s.ask > 0 ? Math.round((net / s.ask) * 100) : null;
        if (
          isPlaceholderBid({
            ...deal,
            sellEstimate: s.expectedResale ?? undefined,
          })
        ) {
          toNeeds("placeholder_bid");
          continue;
        }
        if (net < MIN_PROFIT || profitMargin == null) continue;
        if (profitMargin > MAX_HONEST_MARGIN_PCT) {
          toNeeds("outlier_margin");
          continue;
        }
        const row: Opp = {
          deal,
          ...extras,
          arbitrage: {
            ...base,
            arbitrage: {
              sourcePrice: s.ask,
              targetPrice: s.expectedResale!,
              transportCost: s.transport,
              potentialProfit: net,
              profitMargin,
              distance: miles,
            },
          },
        };
        (miles <= REGIONAL_MILES ? regional : national).push(row);
        const rAgg = routeAgg.get(src) || {
          miles,
          cost: s.transport,
          count: 0,
          profit: 0,
        };
        rAgg.count += 1;
        rAgg.profit += net;
        routeAgg.set(src, rAgg);
      }

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
        arr.reduce((acc, o) => acc + o.arbitrage.arbitrage.potentialProfit, 0);
      // One ranked list across tiers: scored (engine order) then needs-comps (no profit).
      const scoredAll = [...regional, ...national];
      const order = new Map(ranked.map((o, i) => [o.id, i]));
      scoredAll.sort(
        (a, b) => order.get(String(a.deal.id))! - order.get(String(b.deal.id))!,
      );

      return {
        homeState,
        tailored,
        needsHome: false,
        summary: {
          local: localDeals.length,
          regional: regional.length,
          national: national.length,
          regionalProfit: sumProfit(regional),
          nationalProfit: sumProfit(national),
          bestProfit: Math.max(
            0,
            ...scoredAll.map((o) => o.arbitrage.arbitrage.potentialProfit),
          ),
          needsComps: needsComps.length,
          excluded,
        },
        topRoutes,
        localDeals: localDeals.slice(0, 50),
        regionalArbitrage: regional.slice(0, 25),
        nationalArbitrage: national.slice(0, 25),
        needsComps: needsComps.slice(0, 25),
        opportunities: [...scoredAll.slice(0, 50), ...needsComps.slice(0, 25)],
        compQueries: queries,
      };
    });
    return NextResponse.json(
      { ...payload, deskAccess: "flip" },
      { headers: NO_STORE },
    );
  } catch (error: unknown) {
    // Honest empty beats a 500 that /find's fetcher surfaces as "Failed to fetch".
    console.error("Error fetching arbitrage dashboard data:", error);
    return NextResponse.json(
      {
        ...emptyArbitragePayload(paramHome),
        degraded: true,
        deskAccess: "flip",
      },
      { headers: NO_STORE },
    );
  }
}
