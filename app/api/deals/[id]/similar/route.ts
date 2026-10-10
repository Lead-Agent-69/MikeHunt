export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rankAlternatives } from "@/lib/deals/rank-alternatives";
import { applyLiveAuctionWindow } from "@/lib/search/live-auction-window";
import { isAuctionSource } from "@/lib/deal-terms";
import {
  redactListingForNonFlipDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import { fetchSemanticSimilar } from "@/lib/deals/similar-deals";
import { similarSegment } from "@/lib/deals/similar-prefilters";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Output depends on the caller's desk (profit redaction) — never cache it in a shared layer.
const NO_STORE = { "Cache-Control": "private, no-store" };
const json = (body: unknown) => NextResponse.json(body, { headers: NO_STORE });

// GET /api/deals/[id]/similar — semantically-similar deals via pgvector, hard-prefiltered to the
// same segment / price band / year window first (similar_deals_by_id_filtered; legacy RPC +
// in-memory gate until that migration is applied). Falls back to attribute-based matches under the
// same filters when embeddings aren't populated yet.
function mapRow(d: any) {
  return {
    id: d.id,
    year: d.year,
    make: d.make,
    model: d.model,
    askPrice: Number(d.ask_price || 0),
    mileage: d.mileage,
    condition: d.condition,
    damageType: d.damage_type,
    dealVerdict: d.deal_verdict,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    locationState: d.location_state,
    locationCity: d.location_city,
    images: d.images || [],
    source: d.source,
    lastSeenAt: d.last_seen_at,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Fans out to up to 4 pgvector RPCs per call.
  const rl = rateLimit(req, {
    key: "deal-similar",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    const res = tooManyRequests(rl);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  const { id } = await params;
  const supabase = createServerComponentClient();
  // Net profit and profit score only go to a saved reseller / dealer desk (fail closed).
  const flipDesk = await resolveCallerFlipDesk();
  const shape = (d: any) => {
    const card = mapRow(d);
    return flipDesk ? card : redactListingForNonFlipDesk(card);
  };

  const columns =
    "id, year, make, model, ask_price, mileage, condition, damage_type, deal_verdict, true_net_profit, sell_estimate, profit_score, location_state, location_city, images, source, active, last_seen_at, auction_end_at, vin";
  const { data: base, error: baseError } = await supabase
    .from("deals")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (baseError)
    return NextResponse.json(
      { error: "Alternatives couldn't be loaded." },
      { status: 503, headers: NO_STORE },
    );
  if (!base?.make || !base?.model) return json({ similar: [], basis: "none" });
  const segment = similarSegment(base);
  let semanticRows: any[] = [];
  // Re-read semantic suggestions: the RPC alone does not prove current availability.
  try {
    const semantic = await fetchSemanticSimilar(supabase, id, base);
    if (semantic?.rows.length) {
      const hydrated = await supabase
        .from("deals")
        .select(columns)
        .in(
          "id",
          semantic.rows.map((row: any) => row.id),
        )
        .eq("active", true);
      if (!hydrated.error) semanticRows = hydrated.data || [];
    }
  } catch {
    // fall through to attribute-based
  }

  // Include an attribute pool so vector coverage cannot hide a closer-priced match.
  let q = supabase
    .from("deals")
    .select(columns)
    .eq("active", true)
    .eq("make", base.make)
    .neq("id", id)
    .gt("ask_price", 0)
    .gte("last_seen_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(120);

  q = q.ilike("model", String(base.model).replace(/[\\%_]/g, "\\$&"));
  if (base.year) q = q.gte("year", base.year - 2).lte("year", base.year + 2);
  if (!isAuctionSource(base.source) && Number(base.ask_price) > 0)
    q = q
      .gte("ask_price", Math.ceil(Number(base.ask_price) * 0.6))
      .lte("ask_price", Math.floor(Number(base.ask_price) * 1.4));
  q = applyLiveAuctionWindow(q);

  const { data: rows, error } = await q;
  if (error && !semanticRows.length)
    return NextResponse.json(
      { error: "Alternatives couldn't be loaded." },
      { status: 503, headers: NO_STORE },
    );
  return json({
    similar: rankAlternatives(base, [...semanticRows, ...(rows || [])]).map(
      ({ row, matchReasons, priceDifference }) => ({
        ...shape(row),
        matchReasons,
        priceDifference,
      }),
    ),
    basis: semanticRows.length ? "semantic" : "attribute",
    filters: { segment, widened: null },
  });
}
