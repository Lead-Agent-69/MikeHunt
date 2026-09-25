export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  fetchNmvtis,
  sightingsToHistory,
  type VinHistory,
} from "@/lib/vehicle/vin-history";
import { createServerComponentClient } from "@/lib/supabase";

// GET /api/vin/{vin}/history — server tiers:
//   • VIN GRAPH (free, unique): cross-reference the VIN against our own multi-channel scrape records.
//     If we ever saw it at a salvage auction or listed branded/damaged, that's a real flag no
//     single-site report has — and it compounds as we scrape more.
//   • NMVTIS (key-gated): authoritative title brands/total-loss when VINAUDIT_KEY is set.
// The free listing-text tier is merged client-side. We always return SOMETHING useful.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ vin: string }> },
) {
  const { vin } = await ctx.params;
  if (!vin || vin.length !== 17)
    return NextResponse.json({ authoritative: false, source: "none" });

  // Tier 1.5 — our own VIN graph + the raw sighting timeline.
  let graph: VinHistory | null = null;
  let sightings: any[] = [];
  try {
    const sb = createServerComponentClient();
    const { data } = await sb
      .from("deals")
      .select(
        "source, condition, damage_type, mileage, created_at, location_state, ask_price",
      )
      .eq("vin", vin)
      .order("created_at", { ascending: true })
      .limit(40);
    graph = sightingsToHistory(data || []);
    sightings = (data || []).map((r) => ({
      source: r.source,
      date: r.created_at,
      condition: r.condition,
      damage: r.damage_type,
      mileage: r.mileage,
      state: r.location_state,
      askPrice: r.ask_price,
    }));
  } catch {
    /* graph best-effort */
  }

  // Tier 2 — authoritative NMVTIS (only when a key is configured).
  const nmvtis = await fetchNmvtis(vin);

  // Nothing to say only if no flags, no NMVTIS, AND fewer than 2 sightings (a single listing is no
  // history). 2+ sightings is itself a story worth showing even without a red flag.
  if (!nmvtis && !graph && sightings.length < 2)
    return NextResponse.json({ authoritative: false, source: "none" });

  const base: VinHistory = nmvtis ||
    graph || {
      source: "vin-graph",
      authoritative: false,
      titleBrands: [],
      cleanClaims: [],
      note: "",
    };
  const merged: any = {
    ...base,
    titleBrands: Array.from(
      new Set([...(nmvtis?.titleBrands || []), ...(graph?.titleBrands || [])]),
    ),
    note: nmvtis && graph ? `${nmvtis.note} · ${graph.note}` : base.note,
    sightings,
    sightingCount: sightings.length,
  };
  return NextResponse.json(merged);
}
