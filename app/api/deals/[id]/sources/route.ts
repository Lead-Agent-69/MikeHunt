export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/deals/[id]/sources — same VIN across every source, cheapest first. "This car appears on
// 3 sites: cheapest $8,900 on Facebook, dearest $10,400 on AutoTrader." Returns [] for VIN-less deals.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerComponentClient();

  const { data: base } = await supabase
    .from("deals")
    .select("vin, make, model, year, mileage, ask_price, first_seen_at")
    .eq("id", id)
    .maybeSingle();

  const baseInfo = base
    ? {
        make: base.make,
        model: base.model,
        year: base.year,
        mileage: base.mileage,
        askPrice: Number(base.ask_price) || 0,
        firstSeenAt: base.first_seen_at,
      }
    : null;

  const vin = base?.vin;
  if (!vin || String(vin).length !== 17) {
    return NextResponse.json({ sources: [], vin: null, base: baseInfo });
  }

  const { data } = await supabase
    .from("deals")
    .select("id, source, ask_price, source_url, last_seen_at, location_state")
    .eq("vin", vin)
    .eq("active", true)
    .gt("ask_price", 0)
    .order("ask_price", { ascending: true });

  const sources = (data || []).map((d: any) => ({
    id: d.id,
    source: d.source,
    askPrice: Number(d.ask_price),
    url: d.source_url,
    state: d.location_state,
    lastSeenAt: d.last_seen_at,
    isThis: d.id === id,
  }));

  const prices = sources.map((s) => s.askPrice);
  return NextResponse.json({
    vin,
    base: baseInfo,
    sources,
    count: sources.length,
    cheapest: prices.length ? Math.min(...prices) : null,
    dearest: prices.length ? Math.max(...prices) : null,
    spread: prices.length ? Math.max(...prices) - Math.min(...prices) : 0,
  });
}
