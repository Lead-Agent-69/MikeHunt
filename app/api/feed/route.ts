export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  applyInventoryViewScope,
  inventoryViewParams,
} from "@/lib/search/inventory-view-scope";
import { validateInventoryRanges } from "@/lib/search/inventory-filters";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { applyGoProfitPolicy } from "@/lib/scoring/go-policy";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { cached } from "@/lib/cache";
import { buildInterestProfile } from "@/lib/intelligence/interest-profile";
import { scoreInterest } from "@/lib/intelligence/interest-patterns";
import {
  isFlipDeskMode,
  readSavedBuyerMode,
  redactListingForNonFlipDesk,
} from "@/lib/deals/deal-desk-access";

// GET /api/feed?offset=0&limit=12 — the full-screen TikTok-style stream. Active, in-stock, photo-having cars.
// SIGNED-IN users get a "For You" ranking: a taste-ranked pool (quality + interest affinity from their
// saves/watches/views) cached per user, paginated. ANON users get the plain best-first fresh feed. $0.

const COLS =
  "id, source, source_url, title, year, make, model, ask_price, sell_estimate, true_net_profit, profit_score, deal_verdict, location_city, location_state, images, mileage, condition, deal_analysis";

// Paging bounds. A guest can't walk the whole inventory: 30 cards a page, 600 cards deep, 30
// requests a minute per IP. Signed-in For You pages a 250-card pool, so the cap never bites there.
export const FEED_MAX_LIMIT = 30;
export const FEED_MAX_OFFSET = 600;
export const FEED_GUEST_RATE = { limit: 30, windowMs: 60_000 };

function mapItem(d: any) {
  d = applyGoProfitPolicy(d);
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
  try {
    return await getFeed(req);
  } catch (error) {
    return internalError("feed", error);
  }
}

async function getFeed(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const rangeError = validateInventoryRanges(sp);
  if (rangeError)
    return NextResponse.json({ error: rangeError }, { status: 400 });
  const offset = Math.min(
    Math.max(0, Math.floor(Number(sp.get("offset")) || 0)),
    FEED_MAX_OFFSET,
  );
  const limit = Math.min(
    Math.max(Math.floor(Number(sp.get("limit")) || 12), 1),
    FEED_MAX_LIMIT,
  );

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      items: [],
      nextOffset: offset,
      personalized: false,
      message: "Supabase is not configured, so the live feed is unavailable.",
    });
  }

  const scopeKey = inventoryViewParams(sp).toString();

  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await getServerUser();
  // Net profit and profit score only go to a saved reseller / dealer desk. Anon, personal, diy,
  // parts, unknown, or a failed prefs read get redacted cards and non-economic ranking.
  const flipDesk = user?.id
    ? isFlipDeskMode(await readSavedBuyerMode(supabase, user.id))
    : false;
  const forDesk = (items: ReturnType<typeof mapItem>[]) =>
    flipDesk ? items : items.map((it) => redactListingForNonFlipDesk(it));

  // ── FOR YOU (signed in): a taste-ranked pool, cached per user for 60s and paginated over. ──
  if (user?.id) {
    const ranked = await cached(
      `feed:${user.id}:${flipDesk ? "flip" : "personal"}:${scopeKey}`,
      60_000,
      async () => {
        const profile = await buildInterestProfile(supabase, user.id);
        let q = supabase
          .from("deals")
          .select(COLS)
          .eq("active", true)
          .not("images", "is", null)
          .neq("images", "{}")
          .order(flipDesk ? "profit_score" : "last_seen_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("last_seen_at", { ascending: false })
          .order("id", { ascending: true })
          .limit(250);
        q = applyInventoryViewScope(q, sp);
        const { data, error } = await q;
        if (error) throw error;
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
          return {
            it,
            rank: (flipDesk ? (it.score ?? 0) / 100 : 0) + affinity * 1.25,
          };
        });
        scored.sort((a, b) => b.rank - a.rank);
        return scored.map((s) => s.it);
      },
    );
    return NextResponse.json(
      {
        items: forDesk(ranked.slice(offset, offset + limit)),
        nextOffset: offset + limit,
        personalized: true,
        boundedPool: true,
        poolLimit: 250,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // ── ANON: plain best-first, fresh, photo-only feed. ──
  const rl = rateLimit(req, { key: "feed-guest", ...FEED_GUEST_RATE });
  if (!rl.allowed) return tooManyRequests(rl);
  if (offset >= FEED_MAX_OFFSET)
    return NextResponse.json({ items: [], nextOffset: null, capped: true });
  const pageLimit = Math.min(limit, FEED_MAX_OFFSET - offset);
  let q = supabase
    .from("deals")
    .select(COLS)
    .eq("active", true)
    .not("images", "is", null)
    .neq("images", "{}")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + pageLimit - 1);
  q = applyInventoryViewScope(q, sp);

  const { data, error } = await q;
  if (error) throw error;

  const items = (data || [])
    .filter((d: any) => Array.isArray(d.images) && d.images[0])
    .map(mapItem);
  const next = offset + pageLimit;
  return NextResponse.json({
    items: forDesk(items),
    nextOffset: next < FEED_MAX_OFFSET ? next : null,
  });
}
