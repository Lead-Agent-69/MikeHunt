export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rankAlternatives } from "@/lib/deals/rank-alternatives";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";
import { isAuctionSource } from "@/lib/deal-terms";
import {
  redactListingForNonFlipDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import { fetchSemanticSimilar } from "@/lib/deals/similar-deals";
import {
  SIMILAR_MIN_RESULTS,
  similarSegment,
} from "@/lib/deals/similar-prefilters";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { titleSourceOf } from "@/lib/deals/title-category";
import {
  sourcePriceContext,
  SOURCE_PRICE_FIELDS,
} from "@/lib/deals/source-price-context";

// Output depends on the caller's desk (profit redaction) — never cache it in a shared layer.
const NO_STORE = { "Cache-Control": "private, no-store" };
const json = (body: unknown) => NextResponse.json(body, { headers: NO_STORE });
const INVENTORY_TIMEOUT_MS = 3_000;
const SEMANTIC_TIMEOUT_MS = 1_500;

/** Bound the response even if an upstream client does not settle promptly on abort. */
async function lookupWithin<T>(
  requestSignal: AbortSignal,
  timeoutMs: number,
  run: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T | null> {
  if (requestSignal.aborted) return null;
  const controller = new AbortController();
  const signal = AbortSignal.any([requestSignal, controller.signal]);
  let onAbort!: () => void;
  const expired = new Promise<null>((resolve) => {
    onAbort = () => resolve(null);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([expired, run(signal)]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

const unavailable = () =>
  NextResponse.json(
    { error: "Alternatives couldn't be loaded." },
    { status: 503, headers: NO_STORE },
  );

function mapRow(d: any) {
  return {
    id: d.id,
    year: d.year,
    make: d.make,
    model: d.model,
    askPrice: Number(d.ask_price || 0),
    priceContext: sourcePriceContext(d),
    mileage: d.mileage,
    condition: d.condition,
    titleSource: titleSourceOf(d),
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
  const desk = lookupWithin(
    req.signal,
    INVENTORY_TIMEOUT_MS,
    resolveCallerFlipDesk,
  );

  const columns = `id,year,make,model,trim,deal_verdict,true_net_profit,sell_estimate,profit_score,location_state,location_city,images,active,vin,title_source:options->>titleSource,${SOURCE_PRICE_FIELDS}`;
  const reference = await lookupWithin(
    req.signal,
    INVENTORY_TIMEOUT_MS,
    (signal) =>
      supabase
        .from("deals")
        .select(columns)
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle(),
  );
  if (!reference || reference.error) return unavailable();
  const base = reference.data;
  if (!base?.make || !base?.model) return json({ similar: [], basis: "none" });

  let q = applyBuyableInventory(supabase.from("deals").select(columns))
    .eq("make", base.make)
    .neq("id", id)
    .gt("ask_price", 0)
    .order("last_seen_at", { ascending: false })
    .limit(120);

  q = q.ilike("model", String(base.model).replace(/[\\%_]/g, "\\$&"));
  if (base.year) q = q.gte("year", base.year - 2).lte("year", base.year + 2);
  if (!isAuctionSource(base.source) && Number(base.ask_price) > 0)
    q = q
      .gte("ask_price", Math.ceil(Number(base.ask_price) * 0.6))
      .lte("ask_price", Math.floor(Number(base.ask_price) * 1.4));
  const inventory = await lookupWithin(
    req.signal,
    INVENTORY_TIMEOUT_MS,
    (signal) => q.abortSignal(signal),
  );
  const rows = inventory?.error ? [] : inventory?.data || [];
  let ranked = rankAlternatives(base, rows);
  let basis = "attribute";
  if (ranked.length < SIMILAR_MIN_RESULTS) {
    // Only thin searches need vectors. Verify returned IDs against current inventory
    // within the same deadline as the embedding lookup.
    const hydrated = await lookupWithin(
      req.signal,
      SEMANTIC_TIMEOUT_MS,
      async (signal) => {
        const semantic = await fetchSemanticSimilar(supabase, id, base, signal);
        if (!semantic?.rows.length || signal.aborted) return null;
        const result = await applyBuyableInventory(
          supabase
            .from("deals")
            .select(columns)
            .in(
              "id",
              semantic.rows.map((row) => row.id),
            ),
        ).abortSignal(signal);
        return result.error ? null : result.data;
      },
    );
    if (hydrated?.length) {
      const supplemented = rankAlternatives(base, [...rows, ...hydrated]);
      const inventoryIds = new Set(rows.map((row) => row.id));
      if (supplemented.some(({ row }) => !inventoryIds.has(row.id)))
        basis = "semantic";
      ranked = supplemented;
    }
  }
  if ((!inventory || inventory.error) && !ranked.length) return unavailable();
  const flipDesk = await desk;
  return json({
    similar: ranked.map(({ row, matchReasons, priceDifference }) => {
      const card = mapRow(row);
      return {
        ...(flipDesk ? card : redactListingForNonFlipDesk(card)),
        matchReasons,
        priceDifference,
      };
    }),
    basis,
    filters: { segment: similarSegment(base), widened: null },
  });
}
