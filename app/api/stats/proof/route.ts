export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { CURATED_SITES } from "@/lib/scrapers/curated-sites";

// GET /api/stats/proof — the real "here's the scale + the money" numbers for the public landing proof band.
// All live from the DB (no invented figures). Cached in-process 30 min (marketing numbers, not real-time)
// and never cached empty, so a transient miss self-heals. Client created lazily (build-safe).

type Proof = {
  carsScored: number; // active car listings we've priced
  carsBuy: number; // BUY-verdict deals live right now
  avgSpread: number; // avg true net profit on a BUY deal — the money on the table
  totalSpread: number; // SUM of net profit across every live BUY — the whole opportunity on the board
  newBuys7d: number; // BUY deals first seen in the last 7 days
  states: number; // states with active priced cars
  dealers: number; // curated salvage/rebuilder lots
};

let cache: { at: number; data: Proof } | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < 30 * 60 * 1000)
    return NextResponse.json(cache.data);

  const dealers = CURATED_SITES.length;
  try {
    const sb = createServerComponentClient();
    // One RPC — count:exact head:true timed out on the big unfiltered counts (returned 0); a single
    // function with a raised statement_timeout returns them reliably.
    const { data: rows } = await sb.rpc("landing_proof");
    const r = (Array.isArray(rows) ? rows[0] : rows) as {
      cars_scored: number;
      cars_buy: number;
      avg_spread: number;
      total_spread: number;
      new_buys_7d: number;
      states: number;
    } | null;

    const data: Proof = {
      carsScored: Number(r?.cars_scored) || 0,
      carsBuy: Number(r?.cars_buy) || 0,
      avgSpread: Number(r?.avg_spread) || 0,
      totalSpread: Number(r?.total_spread) || 0,
      newBuys7d: Number(r?.new_buys_7d) || 0,
      states: Number(r?.states) || 0,
      dealers,
    };
    // Only cache a populated result. Zero means the RPC missed (or the board is genuinely empty) — either
    // way the next request should retry instead of serving zeros for 30 min.
    if (data.carsScored) cache = { at: now, data };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      carsScored: 0,
      carsBuy: 0,
      avgSpread: 0,
      totalSpread: 0,
      newBuys7d: 0,
      states: 0,
      dealers,
    });
  }
}
