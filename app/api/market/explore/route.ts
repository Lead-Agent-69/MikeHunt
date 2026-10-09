export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  listingsForDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import {
  dealLane,
  LANE_COLORS,
  type DealLane,
} from "@/lib/discovery/categorize";
import { cached } from "@/lib/cache";
import { fetchAllRows } from "@/lib/db/paginate";
import {
  applyVehicleDetails,
  applySelectedSources,
  validateInventoryRanges,
  VEHICLE_CATEGORY_FILTERS,
  INVENTORY_SOURCE_FILTERS,
} from "@/lib/search/inventory-filters";

// /api/market/explore — the advanced sourcing engine. A dealer filters the whole market by state(s),
// channel/lane, price, year, mileage, make, condition, verdict, and source — and chooses CURATED (the
// deals worth acting on) vs WHOLE MARKET (everything active). Returns the filtered rows PLUS facet
// counts (states, lanes, makes) so the UI can show live counts next to every filter. Lane is computed,
// not stored, so we pull the SQL-filtered set (capped) and finish lane filtering + faceting in JS.

const CAP = 8000; // hard ceiling on rows pulled before in-memory lane filter/facet (keeps it fast)

function csv(p: string | null): string[] {
  return (p || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-explore",
    limit: 30,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      rows: [],
      total: 0,
      capped: false,
      mode: "curated",
      page: 0,
      pageSize: 50,
      facets: {},
      configured: false,
    });
  }
  try {
    const sp = new URL(req.url).searchParams;
    const states = csv(sp.get("states")).map((s) => s.toUpperCase());
    const lanes = csv(sp.get("lanes")) as DealLane[];
    const makes = csv(sp.get("makes"))
      .map((m) =>
        m
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, "")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 25);
    const categories = csv(sp.get("categories"));
    if (
      categories.some(
        (category) =>
          !Object.prototype.hasOwnProperty.call(
            VEHICLE_CATEGORY_FILTERS,
            category,
          ),
      )
    )
      return NextResponse.json(
        { error: "Choose a valid vehicle category" },
        { status: 400 },
      );
    const detailParams = new URLSearchParams(sp);
    for (const [oldKey, key] of [
      ["priceMin", "minPrice"],
      ["priceMax", "maxPrice"],
      ["yearMin", "minYear"],
      ["yearMax", "maxYear"],
      ["mileageMax", "maxMileage"],
    ]) {
      if (sp.has(oldKey)) detailParams.set(key, sp.get(oldKey)!);
    }
    const rangeError = validateInventoryRanges(detailParams);
    if (rangeError)
      return NextResponse.json({ error: rangeError }, { status: 400 });
    const flipDesk = await resolveCallerFlipDesk();
    const conditions = csv(sp.get("conditions"));
    const verdicts = flipDesk ? csv(sp.get("verdicts")) : [];
    const sources = csv(sp.get("sources"))
      .map((source) => source.replace(/[^a-zA-Z0-9_-]/g, ""))
      .filter(Boolean);
    if (
      sources.some(
        (source) =>
          !INVENTORY_SOURCE_FILTERS.some((option) => option.id === source),
      )
    )
      return NextResponse.json(
        { error: "Choose a valid inventory source" },
        { status: 400 },
      );
    const sellerTypes = csv(sp.get("sellerTypes")).map((s) => s.toLowerCase());
    const minRoi = flipDesk ? parseFloat(sp.get("minRoi") || "0") || 0 : 0;
    const yearMin = parseInt(sp.get("yearMin") || "0") || 0;
    const yearMax = parseInt(sp.get("yearMax") || "0") || 0;
    const minProfit = flipDesk ? parseInt(sp.get("minProfit") || "0") || 0 : 0;
    const mode = !flipDesk || sp.get("mode") === "all" ? "all" : "curated";
    const requestedSort = sp.get("sort") || "profitEstimate";
    const sort =
      !flipDesk &&
      ["profitEstimate", "profitScore", "sellEstimate"].includes(requestedSort)
        ? "askPrice"
        : requestedSort;
    const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
    const page = Math.max(0, parseInt(sp.get("page") || "0") || 0);
    const pageSize = Math.max(
      1,
      Math.min(200, parseInt(sp.get("pageSize") || "50") || 50),
    );
    // Free-text search across make/model/title (sanitized so it can't break the PostgREST or-filter).
    const search = (sp.get("q") || "")
      .trim()
      .replace(/[^a-zA-Z0-9 -]/g, " ")
      .slice(0, 60);
    const cacheParams = new URLSearchParams(sp);
    cacheParams.delete("page");
    cacheParams.delete("pageSize");

    // Same filter combo within 30s → serve the computed result instantly (no re-scan/re-facet).
    const payload = await cached(
      `mkt:explore:${flipDesk ? "flip" : "personal"}:${cacheParams.toString()}`,
      30_000,
      async () => {
        const supabase = createServerComponentClient();
        const build = () => {
          let q = supabase
            .from("deals")
            .select(
              "id, source, source_url, title, year, make, model, trim, body_class, fuel_type, vin, mileage, condition, damage_type, ask_price, buy_now_price, sell_estimate, profit_score, true_net_profit, recommended_max_bid, deal_verdict, deal_analysis, seller_type, is_arbitrage_opportunity, location_state",
            )
            .eq("active", true);

          // SQL-able filters (push down what we can).
          if (states.length) q = q.in("location_state", states);
          if (search)
            q = q.or(
              `make.ilike.%${search}%,model.ilike.%${search}%,title.ilike.%${search}%,vin.ilike.%${search}%`,
            );
          if (makes.length)
            q = q.or(makes.map((m) => `make.ilike.${m}`).join(",")); // case-insensitive make match
          if (conditions.length) q = q.in("condition", conditions);
          if (verdicts.length) q = q.in("deal_verdict", verdicts);
          q = applySelectedSources(q, sources);
          q = applyVehicleDetails(q, detailParams);
          if (categories.length)
            q = q.or(
              categories
                .map(
                  (category) =>
                    VEHICLE_CATEGORY_FILTERS[
                      category as keyof typeof VEHICLE_CATEGORY_FILTERS
                    ].filter,
                )
                .join(","),
            );
          const model = (sp.get("model") || "")
            .replace(/[^a-zA-Z0-9 -]/g, "")
            .trim()
            .slice(0, 60);
          if (model) q = q.ilike("model", `%${model}%`);
          if (sellerTypes.length) q = q.in("seller_type", sellerTypes);
          if (yearMin > 0) q = q.gte("year", yearMin);
          if (yearMax > 0) q = q.lte("year", yearMax);
          if (minProfit > 0) q = q.gte("true_net_profit", minProfit);
          // CURATED = the deals a dealer should actually look at (engine says go/hold or flagged arbitrage).
          // WHOLE MARKET = no verdict gate. The toggle the user asked for.
          if (mode === "curated" && !verdicts.length)
            q = q.in("deal_verdict", ["go", "hold"]);

          return q.order("id", { ascending: true });
        };
        const observed = await fetchAllRows<any>(
          (from, to) => build().range(from, to),
          { pageSize: 500, max: CAP + 1 },
        );
        const capped = observed.length > CAP;
        const data = observed.slice(0, CAP);

        let rows = (data || []).map((d: any) => ({
          id: d.id,
          source: d.source,
          year: d.year,
          make: d.make,
          model: d.model,
          trim: d.trim,
          askPrice: Number(d.ask_price || 0),
          buyNowPrice:
            d.buy_now_price != null ? Number(d.buy_now_price) : undefined,
          bodyClass: d.body_class || undefined,
          mileage: d.mileage ?? undefined,
          sellEstimate:
            d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
          profitEstimate: Number(d.true_net_profit || 0),
          profitScore: Number(d.profit_score || 0),
          dealVerdict: d.deal_verdict || undefined,
          recommendedMaxBid:
            d.recommended_max_bid != null
              ? Number(d.recommended_max_bid)
              : undefined,
          locationState: d.location_state || undefined,
          condition: d.condition || undefined,
          damageType: d.damage_type || undefined,
          sellerType: d.seller_type || undefined,
          roi:
            d.deal_analysis?.roi != null
              ? Number(d.deal_analysis.roi)
              : undefined,
          lane: dealLane(d),
        }));

        // Lane filter (computed, so done here).
        if (lanes.length) rows = rows.filter((r) => lanes.includes(r.lane));
        // ROI filter — deal_analysis.roi is a JSON number, so compared correctly here (not as PG text).
        if (minRoi > 0)
          rows = rows.filter((r) => (r.roi ?? -Infinity) >= minRoi);

        // Facets over the post-filter set so the UI shows live counts.
        const count = <T extends string>(
          key: (r: (typeof rows)[number]) => T | undefined,
        ) => {
          const m: Record<string, number> = {};
          for (const r of rows) {
            const k = key(r);
            if (k) m[k] = (m[k] || 0) + 1;
          }
          return m;
        };
        const stateCounts = count((r) => r.locationState);
        const laneCounts = count((r) => r.lane);
        const sellerCounts = count((r) => r.sellerType);
        const makeCounts = count((r) => r.make);
        const topMakes = Object.entries(makeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([make, n]) => ({ make, n }));

        // Price distribution — chart-ready histogram (12 quantile-free fixed buckets) for the market viz.
        const prices = rows.map((r) => r.askPrice).filter((p) => p > 0);
        const hiP = prices.length ? Math.max(...prices) : 0;
        const bw =
          hiP > 0 ? Math.max(1000, Math.ceil(hiP / 12 / 1000) * 1000) : 1000;
        const priceHistogram: { from: number; to: number; n: number }[] = [];
        for (let i = 0; i < 12; i++) {
          const from = i * bw;
          priceHistogram.push({ from, to: from + bw, n: 0 });
        }
        for (const p of prices) {
          const idx = Math.min(11, Math.floor(p / bw));
          priceHistogram[idx].n++;
        }
        // Median profit per lane — a "where's the money by channel" bar for the viz.
        const profitByLane: Record<string, number[]> = {};
        for (const r of rows)
          (profitByLane[r.lane] ??= []).push(r.profitEstimate || 0);
        const laneProfit: Record<string, number> = {};
        for (const [lane, arr] of Object.entries(profitByLane)) {
          const s = arr.slice().sort((a, b) => a - b);
          laneProfit[lane] = s.length
            ? Math.round(s[Math.floor(s.length / 2)])
            : 0;
        }

        // Sort + paginate.
        const dir = sortDir === "asc" ? 1 : -1;
        const sortKey = (
          {
            askPrice: "askPrice",
            mileage: "mileage",
            sellEstimate: "sellEstimate",
            profitEstimate: "profitEstimate",
            profitScore: "profitScore",
            year: "year",
          } as Record<string, keyof (typeof rows)[number]>
        )[sort];
        if (sortKey)
          rows.sort(
            (a, b) =>
              dir * ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)),
          );

        const total = rows.length;
        return {
          rows,
          total,
          capped,
          mode,
          facets: {
            states: stateCounts,
            lanes: laneCounts,
            sellerTypes: sellerCounts,
            topMakes,
            priceHistogram,
            laneProfit,
            laneColors: LANE_COLORS,
          },
        };
      },
    );
    const paged = {
      ...payload,
      rows: payload.rows.slice(page * pageSize, (page + 1) * pageSize),
      page,
      pageSize,
    };
    // Cache is shared; redact AFTER so a personal caller never gets a flip-desk hit.
    return NextResponse.json(
      flipDesk
        ? { ...paged, deskAccess: "flip" }
        : {
            ...paged,
            rows: listingsForDesk(paged.rows || [], false),
            facets: payload.facets
              ? { ...payload.facets, laneProfit: {} }
              : payload.facets,
            deskAccess: "personal",
          },
    );
  } catch (e: any) {
    return internalError("market:explore", e);
  }
}
