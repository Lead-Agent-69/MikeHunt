export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import {
  sourcePriceContext,
  SOURCE_PRICE_FIELDS,
} from "@/lib/deals/source-price-context";
import { vendorIdentity } from "@/lib/sources/vendor-identity";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";

const MAX_SOURCES = 50;
// Exact reported VIN observations, with unlike amounts kept out of cash comparisons.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = rateLimit(req, {
    key: "listing-sources",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  const { id } = await params;
  const supabase = createServerComponentClient();

  const { data: base, error: baseError } = await supabase
    .from("deals")
    .select(`vin,make,model,year,first_seen_at,${SOURCE_PRICE_FIELDS}`)
    .eq("id", id)
    .maybeSingle();
  if (baseError)
    return NextResponse.json(
      { error: "Listing sources unavailable" },
      { status: 503 },
    );
  if (!base)
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const now = Date.now();
  const price = sourcePriceContext(base as any, now);
  const baseInfo = base
    ? {
        make: base.make,
        model: base.model,
        year: base.year,
        mileage: base.mileage,
        askPrice: price.canCompareToAskingCurve ? price.cashPrice : null,
        cashPrice: price.cashPrice,
        priceContext: price,
        canCompareToAskingCurve: price.canCompareToAskingCurve,
        firstSeenAt: base.first_seen_at,
      }
    : null;

  const vin = String(base?.vin || "").trim();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) || /^(.)\1{16}$/.test(vin)) {
    return NextResponse.json({
      sources: [],
      vin: null,
      base: baseInfo,
      count: 0,
      hasMore: false,
      comparisonBasis: "reported_asking_and_buy_now",
      comparableCount: 0,
      cheapest: null,
      dearest: null,
      spread: null,
    });
  }

  const { data, error } = await applyBuyableInventory(
    supabase.from("deals").select(`id,location_state,${SOURCE_PRICE_FIELDS}`),
  )
    .eq("vin", vin)
    .order("last_seen_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_SOURCES + 1);
  if (error)
    return NextResponse.json(
      { error: "Listing sources unavailable" },
      { status: 503 },
    );

  const hasMore = (data?.length || 0) > MAX_SOURCES;
  const sources = (data || []).slice(0, MAX_SOURCES).map((d: any) => {
    const priceContext = sourcePriceContext(d, now);
    return {
      id: d.id,
      source: d.source,
      askPrice: priceContext.amount,
      priceContext,
      url: vendorIdentity(d.source, d.source_url).href ?? null,
      state: d.location_state,
      lastSeenAt: d.last_seen_at,
      isThis: d.id === id,
    };
  });

  const prices = sources
    .filter((s) => s.priceContext.comparisonEligible)
    .map((s) => s.priceContext.cashPrice as number);
  const comparable = !hasMore && prices.length >= 2;
  return NextResponse.json({
    vin,
    base: baseInfo,
    sources,
    count: sources.length,
    hasMore,
    comparisonBasis: "reported_asking_and_buy_now",
    comparableCount: prices.length,
    cheapest: comparable ? Math.min(...prices) : null,
    dearest: comparable ? Math.max(...prices) : null,
    spread: comparable ? Math.max(...prices) - Math.min(...prices) : null,
  });
}
