export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { fetchAllRows } from "@/lib/db/paginate";
import { resolveCallerDesk } from "@/lib/deals/deal-desk-access";
import {
  applyInventoryLane,
  applyVehicleDetails,
  uniqueDbSources,
  sellerTypeSourceValues,
  sourceUrlNeedles,
  validateInventoryRanges,
} from "@/lib/search/inventory-filters";
import {
  AUCTION_DB_SOURCES,
  wantsAuctionInventory,
} from "@/lib/discovery/auction-scope";
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
  if (c.includes("salvage")) return "salvage";
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
    sellerTypeSourceValues("dealer").includes(s)
  ) {
    return "dealer";
  }
  if (["craigslist", "facebook_marketplace", "offerup"].includes(s)) {
    return "private";
  }
  return null;
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
            ? "Salvage title"
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
  const { searchParams: params } = new URL(req.url);
  const rangeError = validateInventoryRanges(params);
  if (rangeError)
    return NextResponse.json({ error: rangeError }, { status: 400 });
  const make = params.get("make");
  const cascade = !!make && make !== "all";
  if (!isSupabaseConfigured())
    return NextResponse.json({
      configured: false,
      makes: [],
      states: [],
      years: [],
      titleTypes: [],
      sellerTypes: [],
      sources: [],
      models: cascade ? [] : undefined,
    });
  const supabase = createServerComponentClient();
  const flipDesk = (await resolveCallerDesk()) === "flip";
  const source = params.get("source") || "";
  const lane = params.get("lane") || "all";
  const seller = params.get("sellerType") || "all";
  const sourceIds = (params.get("dealerSourceIds") || "")
    .split(",")
    .filter(Boolean);
  const build = () => {
    let query = supabase
      .from("deals")
      .select(
        cascade
          ? "id,model"
          : "id,make,location_state,year,condition,source,source_url",
      )
      .eq("active", true);
    if (
      !wantsAuctionInventory({
        lane,
        sellerType: seller,
        sources: [source, ...sourceIds],
      })
    )
      query = query.not("source", "in", `(${AUCTION_DB_SOURCES.join(",")})`);
    query = applyInventoryLane(query, lane);
    query = applyVehicleDetails(query, params);
    if (
      Number(params.get("maxPrice")) > 0 ||
      Number(params.get("minPrice")) > 0
    )
      query = query.gt("ask_price", 0);
    if (flipDesk && Number(params.get("minProfit")) > 0)
      query = query.gte("true_net_profit", Number(params.get("minProfit")));
    const verdict = params.get("verdict");
    if (flipDesk && verdict && verdict !== "all") {
      if (verdict === "watch")
        query = query
          .gte("ask_price", 3000)
          .gt("sell_estimate", 0)
          .not("true_net_profit", "is", null)
          .lt("true_net_profit", 0);
      else query = query.eq("deal_verdict", verdict);
    }
    const state = params.get("state");
    if (state && !["all", "nationwide"].includes(state.toLowerCase()))
      query = query.eq("location_state", state.toUpperCase());
    const q = (params.get("q") || "")
      .replace(/[^a-zA-Z0-9 -]/g, " ")
      .trim()
      .slice(0, 60);
    if (q)
      query = query.or(
        `title.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,vin.ilike.%${q}%`,
      );
    for (const [key, column, minimum] of [
      ["minPrice", "ask_price", true],
      ["maxPrice", "ask_price", false],
      ["minYear", "year", true],
      ["maxYear", "year", false],
      ["minMileage", "mileage", true],
      ["maxMileage", "mileage", false],
    ] as const) {
      const value = Number(params.get(key));
      if (value > 0)
        query = minimum ? query.gte(column, value) : query.lte(column, value);
    }
    if (cascade) query = query.ilike("make", make!);
    if (source && source !== "all") {
      query = query.in("source", uniqueDbSources([source]));
      const needles = sourceUrlNeedles(source);
      if (needles.length)
        query = query.or(
          needles.map((needle) => `source_url.ilike.%${needle}%`).join(","),
        );
    }
    const sellers = sellerTypeSourceValues(seller);
    if (sellers.length) query = query.in("source", sellers);
    const title = params.get("titleType");
    if (title && title !== "all")
      query = query.eq(
        "condition",
        (
          {
            clean: "clean_title",
            rebuilt: "rebuilt_title",
            salvage: "salvage_title",
            parts: "parts_only",
          } as Record<string, string>
        )[title] || title,
      );
    const availability = params.get("availability");
    if (availability && availability !== "all")
      query = query.eq("availability_status", availability);
    const drivetrain = params.get("drivetrain");
    if (drivetrain && drivetrain !== "all")
      query = query.eq("options->>drivetrain", drivetrain);
    if (params.get("madeInUsa") === "1")
      query = query.or(
        "assembly_country.ilike.%united states%,assembly_country.ilike.%usa%",
      );
    const hosts = (params.get("dealers") || "")
      .split(",")
      .map((host) => host.replace(/[^a-z0-9.-]/gi, ""))
      .filter(Boolean)
      .slice(0, 25);
    if (hosts.length)
      query = query.or(
        hosts.map((host) => `source_url.ilike.%${host}%`).join(","),
      );
    if (sourceIds.length) {
      query = query.in("source", uniqueDbSources(sourceIds));
      const needles = sourceIds.flatMap(sourceUrlNeedles);
      if (needles.length)
        query = query.or(
          needles.map((needle) => `source_url.ilike.%${needle}%`).join(","),
        );
    }
    return query.order("id", { ascending: true });
  };
  try {
    const rows = await fetchAllRows<any>(
      (from, to) => build().range(from, to),
      { max: 30000 },
    );
    const bounded = rows.length === 30000;
    if (!cascade)
      return NextResponse.json({ ...buildScanFacetSummary(rows), bounded });
    const models = new Map<string, number>();
    for (const row of rows) inc(models, row.model);
    return NextResponse.json({
      make,
      bounded,
      models: Array.from(models.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([model, count]) => ({ model, count })),
    });
  } catch (error) {
    return internalError("scan:facets", error);
  }
}
