export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import {
  redactListingForNonFlipDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import {
  fetchAttributeSimilar,
  fetchSemanticSimilar,
} from "@/lib/deals/similar-deals";
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
    dealVerdict: d.deal_verdict,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    locationState: d.location_state,
    locationCity: d.location_city,
    images: d.images || [],
    source: d.source,
    similarity:
      d.similarity != null ? Math.round(Number(d.similarity) * 100) : undefined,
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

  // Hard prefilters (segment, price band, year window) run BEFORE semantic ranking; see
  // lib/deals/similar-prefilters.ts for the rules and widening order.
  const { data: base } = await supabase
    .from("deals")
    .select("make, model, year, ask_price")
    .eq("id", id)
    .maybeSingle();
  if (!base?.make) return json({ similar: [], basis: "none" });
  const segment = similarSegment(base);

  // 1. Semantic path (pgvector), prefiltered.
  const semantic = await fetchSemanticSimilar(supabase, id, base);
  if (semantic) {
    return json({
      similar: semantic.rows.map(shape),
      basis: "semantic",
      filters: { segment, widened: semantic.step },
    });
  }

  // 2. Attribute-based fallback — same make under the same segment / price / year tiers.
  const attr = await fetchAttributeSimilar(supabase, id, base);
  return json({
    similar: attr.rows.map(shape),
    basis: "attribute",
    filters: { segment, widened: attr.step },
  });
}
