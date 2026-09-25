export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// GET /api/scan/facets?state=TX          → all makes (+ states/years) that have live inventory
// GET /api/scan/facets?state=TX&make=Ford → the CASCADE: every model Ford has in stock (Copart-style)
// Options are derived from live inventory so a filter never offers a make/model that returns zero.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "facets", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state")?.toUpperCase();
  const make = searchParams.get("make")?.trim();
  const supabase = createServerComponentClient();

  // ── CASCADE: models for one make ──────────────────────────────────────────
  // Filtering to a single make keeps the row set small, so we get that make's COMPLETE model list.
  if (make && make !== "all") {
    let mq = supabase
      .from("deals")
      .select("model")
      .eq("active", true)
      .gt("ask_price", 0)
      .ilike("make", make)
      .not("model", "is", null)
      .limit(20000);
    if (state) mq = mq.eq("location_state", state);
    const { data, error } = await mq;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    const models = new Map<string, number>();
    for (const r of data || [])
      if (r.model) models.set(r.model, (models.get(r.model) || 0) + 1);
    return NextResponse.json({
      make,
      models: Array.from(models.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([model, count]) => ({ model, count })),
    });
  }

  // ── BASE: full make list (+ states / years) ───────────────────────────────
  // Pull just the small facet columns so we can scan a WIDE slice and not miss a make. Distinct makes are
  // few (~60 brands) so this captures the full menu; models come from the per-make cascade above.
  let q = supabase
    .from("deals")
    .select("make, location_state, year")
    .eq("active", true)
    .gt("ask_price", 0)
    .not("make", "is", null)
    .limit(30000);
  if (state) q = q.eq("location_state", state);

  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const makes = new Map<string, number>();
  const states = new Set<string>();
  const years = new Set<number>();
  for (const r of data || []) {
    if (r.make) makes.set(r.make, (makes.get(r.make) || 0) + 1);
    if (r.location_state) states.add(r.location_state);
    if (r.year) years.add(Number(r.year));
  }

  return NextResponse.json({
    // makes sorted by inventory volume (most-stocked first), with counts
    makes: Array.from(makes.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([make, count]) => ({ make, count })),
    states: Array.from(states).sort(),
    years: Array.from(years).sort((a, b) => b - a),
  });
}
