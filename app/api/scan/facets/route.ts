export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  dealerSourceIdFromUrl,
  displaySource,
  sourceMeta,
} from "@/lib/sources/source-meta";

function inc(map: Map<string, number>, key?: string | null) {
  const normalized = String(key || "").trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function topCounts(map: Map<string, number>, limit = 40) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function titleBucket(condition?: string | null) {
  const c = String(condition || "").toLowerCase();
  if (!c) return null;
  if (c.includes("salvage") || c.includes("repair")) return "salvage";
  if (c.includes("rebuilt")) return "rebuilt";
  if (c.includes("parts")) return "parts";
  if (c.includes("clean")) return "clean";
  return null;
}

function sellerBucket(source?: string | null, sourceUrl?: string | null) {
  const s = String(source || "").toLowerCase();
  const url = String(sourceUrl || "").toLowerCase();
  if (["copart", "iaa", "adesa", "manheim", "acv", "gov_auction"].includes(s)) {
    return "auction";
  }
  if (
    s === "independent_dealer" ||
    Boolean(dealerSourceIdFromUrl(url)) ||
    ["carvana", "cars_com", "cargurus", "autotrader"].includes(s)
  ) {
    return "dealer";
  }
  if (["craigslist", "facebook_marketplace", "offerup"].includes(s)) {
    return "private";
  }
  return null;
}

function numericParam(value: string | null) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function applyBuyerFacetScope(
  query: any,
  scope: {
    lane?: string;
    maxPrice?: number;
    minPrice?: number;
  },
) {
  let scoped = query;
  if (scope.maxPrice) scoped = scoped.lte("ask_price", scope.maxPrice);
  if (scope.minPrice) scoped = scoped.gte("ask_price", scope.minPrice);
  if (scope.lane && scope.lane !== "all") {
    const lane = scope.lane.toLowerCase();
    const AUCTION = ["copart", "iaa", "adesa", "manheim", "acv", "gov_auction"];
    const RETAIL = [
      "carvana",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "vroom",
    ];
    const PRIVATE = ["craigslist", "facebook_marketplace", "offerup"];
    const GOVERNMENT = ["gov_auction"];
    const PARTS = ["carparts_com"];
    if (lane === "auction") scoped = scoped.in("source", AUCTION);
    else if (lane === "damaged") {
      scoped = scoped.or(
        [
          "condition.in.(salvage_title,rebuilt_title,parts_only,fire,flood,hail,repairable)",
          "damage_type.ilike.%repairable%",
          "damage_type.ilike.%damage%",
          "damage_type.ilike.%collision%",
        ].join(","),
      );
    } else if (lane === "clean-retail") scoped = scoped.in("source", RETAIL);
    else if (lane === "private") scoped = scoped.in("source", PRIVATE);
    else if (lane === "government") scoped = scoped.in("source", GOVERNMENT);
    else if (lane === "parts") scoped = scoped.in("source", PARTS);
  }
  return scoped;
}

export function buildScanFacetSummary(
  rows: Array<{
    make?: string | null;
    location_state?: string | null;
    year?: number | string | null;
    condition?: string | null;
    source?: string | null;
    source_url?: string | null;
  }>,
) {
  const makes = new Map<string, number>();
  const states = new Set<string>();
  const years = new Set<number>();
  const titleTypes = new Map<string, number>();
  const sellerTypes = new Map<string, number>();
  const sources = new Map<string, number>();
  for (const r of rows || []) {
    if (r.make) makes.set(r.make, (makes.get(r.make) || 0) + 1);
    if (r.location_state) states.add(r.location_state);
    if (r.year) years.add(Number(r.year));
    inc(titleTypes, titleBucket(r.condition));
    inc(sellerTypes, sellerBucket(r.source, r.source_url));
    const sourceId =
      dealerSourceIdFromUrl(r.source_url) ||
      displaySource(r.source, r.source_url) ||
      r.source;
    inc(sources, sourceId);
  }

  return {
    makes: Array.from(makes.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([make, count]) => ({ make, count })),
    states: Array.from(states).sort(),
    years: Array.from(years).sort((a, b) => b - a),
    titleTypes: topCounts(titleTypes, 10).map((item) => ({
      ...item,
      label:
        item.value === "clean"
          ? "Clean title"
          : item.value === "salvage"
            ? "Salvage / repairable"
            : item.value === "rebuilt"
              ? "Rebuilt title"
              : item.value === "parts"
                ? "Parts only"
                : item.value,
    })),
    sellerTypes: topCounts(sellerTypes, 10).map((item) => ({
      ...item,
      label:
        item.value === "dealer"
          ? "Dealers"
          : item.value === "auction"
            ? "Auctions"
            : item.value === "private"
              ? "Private sellers"
              : item.value,
    })),
    sources: topCounts(sources, 40).map((item) => {
      const meta = sourceMeta(item.value);
      return {
        ...item,
        label: meta.label,
        channel: meta.channel,
      };
    }),
  };
}

// GET /api/scan/facets?state=TX          → all makes (+ states/years) that have live inventory
// GET /api/scan/facets?state=TX&make=Ford → the CASCADE: every model Ford has in stock (Copart-style)
// Options are derived from live inventory so a filter never offers a make/model that returns zero.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "facets", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state")?.toUpperCase();
  const make = searchParams.get("make")?.trim();
  const lane = (searchParams.get("lane") || "").toLowerCase();
  const maxPrice = numericParam(searchParams.get("maxPrice"));
  const minPrice = numericParam(searchParams.get("minPrice"));
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      makes: [],
      states: [],
      years: [],
      titleTypes: [],
      sellerTypes: [],
      sources: [],
      models: make && make !== "all" ? [] : undefined,
    });
  }
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
    mq = applyBuyerFacetScope(mq, { lane, maxPrice, minPrice });
    if (state) mq = mq.eq("location_state", state);
    const { data, error } = await mq;
    if (error)
      return internalError("scan:facets", error);
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
    .select("make, location_state, year, condition, source, source_url")
    .eq("active", true)
    .gt("ask_price", 0)
    .not("make", "is", null)
    .limit(30000);
  q = applyBuyerFacetScope(q, { lane, maxPrice, minPrice });
  if (state) q = q.eq("location_state", state);

  const { data, error } = await q;
  if (error)
    return internalError("scan:facets", error);

  return NextResponse.json(buildScanFacetSummary(data || []));
}
