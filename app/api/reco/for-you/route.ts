export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import {
  buildAffinityProfile,
  rankForYou,
  type Facet,
  type AffinityProfile,
} from "@/lib/intelligence/affinity";
import { readUserSignals } from "@/lib/reco/signals";
import {
  effectiveHome,
  effectiveSearchLocations,
} from "@/lib/preferences/locations";
import { isFlipDeskMode, listingsForDesk } from "@/lib/deals/deal-desk-access";

// GET /api/reco/for-you?limit=24 — signed-in "For You" ranked from the user's own view signals.
//
// rank = 0.55·affinity (make/model, price band, body, year band, state, title, source — decayed,
// session-boosted) + 0.20·freshness (first seen) + 0.15·locality (prefs.homeLocation, then
// searchLocations) + 0.10·engine quality. Dismissed listings never return; opened ones drop.
// ~15% of slots (every 7th) are exploration picks outside the user's pattern, labeled as such.
// Flip economics and seller contact are redacted unless the saved desk is reseller/dealer.

const COLS =
  "id, source, source_url, title, year, make, model, trim, body_class, ask_price, sell_estimate, true_net_profit, profit_score, recommended_max_bid, deal_verdict, location_city, location_state, images, mileage, condition, first_seen_at, last_seen_at";
const POOL = 250;

function topValues(profile: AffinityProfile, facet: Facet, n: number) {
  return Array.from(profile.facets[facet].entries())
    .filter(([, s]) => s.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, n)
    .map(([v]) => v);
}

function mapCard(d: any) {
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    title:
      d.title ||
      `${d.year || ""} ${d.make || ""} ${d.model || ""} ${d.trim || ""}`
        .replace(/\s+/g, " ")
        .trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    bodyClass: d.body_class || null,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : null,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    dealVerdict: d.deal_verdict,
    mileage: d.mileage,
    condition: d.condition,
    locationCity: d.location_city,
    locationState: d.location_state,
    images: Array.isArray(d.images) ? d.images.slice(0, 4) : [],
    firstSeenAt: d.first_seen_at || null,
    lastSeenAt: d.last_seen_at || null,
  };
}

export async function GET(req: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const rl = rateLimit(req, {
    key: "reco-for-you",
    limit: 30,
    windowMs: 60_000,
    identity: `user:${user.id}`,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const headers = { "Cache-Control": "private, no-store" };
  const limit = Math.min(
    48,
    Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 24),
  );
  if (!isSupabaseConfigured())
    return NextResponse.json(
      { items: [], personalized: false, configured: false },
      { headers },
    );

  const sb = createServerComponentClient();
  const [rows, prefsRes] = await Promise.all([
    readUserSignals(sb, user.id),
    Promise.resolve(
      sb
        .from("user_preferences")
        .select("prefs")
        .eq("user_id", user.id)
        .maybeSingle(),
    ).catch(() => ({ data: null })),
  ]);
  const prefs = ((prefsRes as any)?.data?.prefs ?? null) as Record<
    string,
    any
  > | null;
  const homeState = effectiveHome(prefs)?.state || null;
  const searchStates = effectiveSearchLocations(prefs).map((l) => l.state);
  const states = Array.from(
    new Set([homeState, ...searchStates].filter(Boolean) as string[]),
  );
  const flipDesk = isFlipDeskMode(prefs?.buyerScope?.buyerMode);
  const profile = buildAffinityProfile(rows);

  const base = () => {
    let q = sb
      .from("deals")
      .select(COLS)
      .eq("active", true)
      .gt("ask_price", 0)
      .not("images", "is", null);
    if (states.length === 1) q = q.eq("location_state", states[0]);
    else if (states.length > 1) q = q.in("location_state", states);
    return q;
  };
  // Pool 1: newest in the user's states. Pool 2: their top makes (by name, case as stored).
  const makes = topValues(profile, "make", 5);
  const labelMakes = Array.from(
    new Set(
      rows
        .map((r) => (r.make || "").trim())
        .filter(
          (m) =>
            m && makes.includes(m.toLowerCase().replace(/[^a-z0-9]+/g, "")),
        ),
    ),
  ).slice(0, 8);
  const [fresh, liked] = await Promise.all([
    base().order("first_seen_at", { ascending: false }).limit(POOL),
    labelMakes.length
      ? base()
          .in("make", labelMakes)
          .order("last_seen_at", { ascending: false })
          .limit(POOL)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const byId = new Map<string, any>();
  for (const d of [
    ...((fresh as any)?.data || []),
    ...((liked as any)?.data || []),
  ])
    if (d?.id && Array.isArray(d.images) && d.images[0]) byId.set(d.id, d);

  const ranked = rankForYou(
    Array.from(byId.values()).map((d) => ({
      id: d.id,
      make: d.make,
      model: d.model,
      year: d.year,
      price: Number(d.ask_price) || null,
      body: d.body_class,
      state: d.location_state,
      source: d.source,
      title_class: null,
      firstSeenAt: d.first_seen_at,
      quality: d.profit_score,
      row: d,
    })),
    profile,
    { homeState, searchStates, limit },
  );

  const cards = ranked.map((r) => ({
    ...mapCard(r.item.row),
    forYouReason: r.reason,
    slot: r.slot,
  }));
  return NextResponse.json(
    {
      items: listingsForDesk(cards, flipDesk),
      personalized: profile.signalCount > 0,
      basedOnSignals: profile.signalCount,
      homeState,
      deskAccess: flipDesk ? "flip" : "personal",
    },
    { headers },
  );
}
