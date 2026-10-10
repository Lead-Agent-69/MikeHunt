export const dynamic = "force-dynamic";
import { hasReportedRepairRisk } from "@/lib/intelligence/repair-risk";

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { filterRailsForDesk } from "@/lib/discovery/desk-rails";
import {
  JUST_LISTED_WINDOW_HOURS,
  justListedRail,
} from "@/lib/discovery/just-listed";
import {
  categorize,
  auctionHeat,
  dealLane,
  LANE_COLORS,
} from "@/lib/discovery/categorize";
import {
  compareFlip,
  comparePersonal,
  dropsForNoRepair,
  isFlipMode,
  rowMatchesBuyerQuery,
  transportAdjustedProfit,
  type BuyerScopePrefs,
} from "@/lib/discovery/for-you-rank";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { wantsAuctionInventory } from "@/lib/discovery/auction-scope";
import { cached } from "@/lib/cache";
import { valueConfidence } from "@/lib/valuation/confidence";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { discoverHomeState } from "@/lib/discovery/home-state";
import {
  buildDiscoverCoverage,
  unavailableCoverage,
  type DiscoverCoverage,
} from "@/lib/discovery/coverage";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";
import { isAutomationAllowedSource } from "@/lib/scrapers/sweep-schedule";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";
import { previewPublicSurplus } from "@/lib/scrapers/sources/publicsurplus";
import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";
import { analyzeDeal } from "@/lib/scoring/deal-analyzer";
import {
  DEALER_SOURCE_DOMAINS,
  dealerSourceIdFromUrl,
  sourceFromUrl,
  sourceMeta,
} from "@/lib/sources/source-meta";
import { sellerContactFields } from "@/lib/data/deal-contact";
import {
  redactListingForNonFlipDesk,
  resolveCallerDesk,
} from "@/lib/deals/deal-desk-access";
import { seenTimestampOrNull } from "@/lib/deals/listing-freshness";

// /api/discover — the meta-search/aggregator endpoint (CarGurus/Kayak style).
// Pulls active deals, MERGES duplicates of the same car across sources by VIN (cheapest wins,
// other listings attached), grades each vs market, and groups into categorized rails.

function mapDeal(
  d: any,
  alsoOn: { source: string; askPrice: number; url: string }[],
) {
  const options = rowOptions(d);
  const contact = sellerContactFields(d);
  const tags = categorize({ ...d, sellBasis: d.deal_analysis?.sellBasis });
  const { heat, hoursLeft } = auctionHeat(d.auction_end_at);
  // Channel/risk lane (auction/salvage/repairable/clean-retail/private) + its color, so the card can
  // show a lane chip and the per-lane rails below can group the same way the scan table does.
  const lane = dealLane(d);
  const quality = gradeDataQuality({
    images: d.images || [],
    vin: d.vin,
    titleType: tags.titleClass,
    condition: d.condition,
    damageType: d.damage_type,
    mileage: d.mileage,
    locationCity: d.location_city,
    locationState: d.location_state,
    askPrice: d.ask_price,
    seller: d.seller || options.seller,
    sellerType: d.seller_type || options.sellerType,
    sellerPhone: contact.sellerPhone,
    sellerEmail: contact.sellerEmail,
    sellerContactUrl: contact.sellerContactUrl,
    auctionEndAt: d.auction_end_at,
    sourceUrl: d.source_url,
  });
  return {
    id: d.id,
    source: d.source,
    sourceUrl: d.source_url,
    lane,
    laneColor: LANE_COLORS[lane],
    // VIN-graph red flags (prior salvage / title-washing / rollback) — the moat, surfaced on the card.
    vinFlags: d.deal_analysis?.vinFlags as string[] | undefined,
    vinFlagSeverity: d.deal_analysis?.vinFlagSeverity as
      | "high"
      | "info"
      | undefined,
    ...contact,
    sellerType: rowSellerType(d),
    title: d.title || `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
    year: d.year,
    make: d.make,
    model: d.model,
    vin: d.vin,
    mileage: d.mileage,
    condition: d.condition,
    damageType: d.damage_type,
    askPrice: Number(d.ask_price || 0),
    sellEstimate: d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
    // Honest confidence for the resale number, so the card shows whether it's comp-backed or a guess.
    valueConfidence: valueConfidence(
      d.deal_analysis?.sellBasis,
      d.deal_analysis?.soldAnchored,
    ),
    // Evidence count behind the number (real comps + sold) — surfaces the "backed by N" trust hint.
    valueEvidence:
      (d.deal_analysis?.valuation?.compCount ?? 0) +
      (d.deal_analysis?.valuation?.soldCount ?? 0),
    compCount: d.deal_analysis?.valuation?.compCount ?? 0,
    sellBasis: d.deal_analysis?.sellBasis,
    soldAnchored: d.deal_analysis?.soldAnchored === true,
    valueAsOf: d.deal_analysis?.valuation?.asOf || d.last_seen_at || null,
    profitScore: d.profit_score != null ? Number(d.profit_score) : undefined,
    trueNetProfit:
      d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
    recommendedMaxBid:
      d.recommended_max_bid != null ? Number(d.recommended_max_bid) : undefined,
    repairEstimate:
      d.repair_estimate != null
        ? Number(d.repair_estimate)
        : d.deal_analysis?.costs?.repair != null
          ? Number(d.deal_analysis.costs.repair)
          : undefined,
    transportEstimate:
      d.transport_cost != null
        ? Number(d.transport_cost)
        : d.deal_analysis?.costs?.transport != null
          ? Number(d.deal_analysis.costs.transport)
          : undefined,
    dealVerdict: d.deal_verdict,
    warnings: d.deal_analysis?.warnings || [],
    locationCity: d.location_city,
    locationState: d.location_state,
    images: d.images || [],
    dataQuality: {
      score: quality.score,
      label: quality.label,
      missing: quality.missing.map(fieldLabel),
    },
    lastSeenAt: d.last_seen_at,
    firstSeenAt: d.first_seen_at,
    auctionEndAt: d.auction_end_at,
    heat,
    hoursLeft: hoursLeft != null ? Math.round(hoursLeft * 10) / 10 : null,
    // discovery tags
    ...tags,
    // cross-source merge ("also found on N sites")
    alsoOn,
    listingCount: alsoOn.length + 1,
    // Forward-looking forecast for the card chip (time-to-sell, urgency, price-drop odds).
    prediction: d.deal_analysis?.prediction,
  };
}

function rowSellerType(row: any) {
  const options = rowOptions(row);
  const explicit = String(
    row.seller_type || row.sellerType || options.sellerType || "",
  ).toLowerCase();
  if (["dealer", "auction", "private"].includes(explicit)) return explicit;
  const sourceKey =
    sourceFromUrl(String(row.source_url || row.sourceUrl || "")) ||
    String(row.source || "");
  const channel = sourceMeta(sourceKey).channel;
  if (
    channel === "auction" ||
    channel === "salvage" ||
    channel === "wholesale" ||
    channel === "gov"
  ) {
    return "auction";
  }
  if (channel === "dealer" || channel === "retail") return "dealer";
  if (channel === "private" || channel === "marketplace") return "private";
  return "";
}

function rowOptions(row: any) {
  return row && typeof row.options === "object" && row.options
    ? row.options
    : {};
}

function matchesSellerType(row: any, sellerType?: string) {
  if (!sellerType || sellerType === "all") return true;
  return rowSellerType(row) === sellerType;
}

function normalizeQuery(value: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDealerSourceIds(value: string | null) {
  const known = new Set(Object.keys(DEALER_SOURCE_DOMAINS));
  return (value || "")
    .toLowerCase()
    .split(",")
    .map((id) =>
      id
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "")
        .trim(),
    )
    .filter((id) => known.has(id))
    .slice(0, 25);
}

function parseMakesParam(value: string | null) {
  const seen = new Set<string>();
  const makes: string[] = [];
  for (const part of (value || "").split(",")) {
    const make = part.trim().replace(/\s+/g, " ");
    const key = make.toLowerCase();
    if (!make || seen.has(key)) continue;
    seen.add(key);
    makes.push(make);
    if (makes.length >= 12) break;
  }
  return makes;
}

function rowMatchesMakes(row: { make?: string | null }, makes: string[]) {
  if (!makes.length) return true;
  const make = String(row.make || "")
    .trim()
    .toLowerCase();
  if (!make) return false;
  return makes.some((wanted) => wanted.toLowerCase() === make);
}

function rowTitleSignal(row: any) {
  return [
    row.title_type,
    row.titleType,
    row.title_status,
    row.titleStatus,
    row.condition,
    row.damage_type,
    row.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function rowMatchesQuery(row: any, q: string) {
  // "suvs" / "trucks" from an empty makes list is a segment, not a title substring.
  return rowMatchesBuyerQuery(row, q);
}

function buyerScopeReasons(
  deal: any,
  opts: {
    state?: string;
    states?: string[];
    minPrice?: number;
    maxPrice?: number;
    q?: string;
    lane?: string;
    titleType?: string;
    dealerSourceIds?: string[];
  },
) {
  const reasons: string[] = [];
  const dealState = String(deal.locationState || deal.location_state || "")
    .trim()
    .toUpperCase();
  const states = [
    ...(opts.states || []),
    ...(opts.state ? [opts.state] : []),
  ].filter(Boolean);
  if (states.length && dealState && states.includes(dealState)) {
    reasons.push(`${dealState} match`);
  }
  if (opts.maxPrice && Number(deal.askPrice || deal.ask_price || 0) > 0) {
    reasons.push(`under $${opts.maxPrice.toLocaleString()}`);
  }
  if (opts.minPrice && Number(deal.askPrice || deal.ask_price || 0) > 0) {
    reasons.push(`over $${opts.minPrice.toLocaleString()}`);
  }
  if (opts.titleType && opts.titleType !== "all") {
    reasons.push(`${opts.titleType} title scope`);
  }
  if (opts.dealerSourceIds?.length) {
    reasons.push(`${opts.dealerSourceIds.length} watched dealer target`);
  }
  if (opts.lane && opts.lane !== "all") {
    reasons.push(
      opts.lane === "damaged"
        ? "damage/repair lane"
        : `${opts.lane.replace(/-/g, " ")} lane`,
    );
  }
  if (opts.q) {
    reasons.push(`matches "${opts.q}"`);
  }
  if (deal.sourceUrl || deal.source_url) reasons.push("source link verified");
  if ((deal.images || []).length) reasons.push("photo backed");
  return reasons.slice(0, 4);
}

async function publicPreviewDeals(
  state?: string,
  maxPrice?: number,
  q = "",
  lane = "all",
  sellerType = "all",
  selectedSources: string[] = [],
  makes: string[] = [],
) {
  const plan = planScrapeForBuyerScope({
    lane: lane || "all",
    q,
    state: state || "Nationwide",
    sellerType,
  });
  const previewSources = [
    { id: "copart", fetchRows: () => previewCopartLots(36) },
    { id: "govdeals", fetchRows: () => previewGovDeals(1) },
    { id: "publicsurplus", fetchRows: () => previewPublicSurplus(1) },
    { id: "municibid", fetchRows: () => previewMunicibid(1) },
  ].filter(
    (source) =>
      // Same terms gate as the sweep and /api/scan: never fetch a TOS-restricted site from an
      // anonymous preview unless the operator opted in through SCRAPE_SOURCES.
      isAutomationAllowedSource(source.id) &&
      wantsAuctionInventory({ lane, sellerType, sources: selectedSources }) &&
      plan.sourceIds.includes(source.id) &&
      (!selectedSources.length || selectedSources.includes(source.id)),
  );

  const settled = await Promise.allSettled(
    previewSources.map(async (source) => ({
      id: source.id,
      rows: await source.fetchRows(),
    })),
  );

  const rawSources = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          id: previewSources[index]?.id || "unknown",
          rows: [],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "Preview failed",
        },
  );

  if (previewSources.length === 0) {
    return {
      proof: [
        {
          id: lane || "all",
          status: "no_rows" as const,
          rows: 0,
          matchedRows: 0,
          detail:
            "No no-login public preview source is available for this lane yet.",
        },
      ],
      deals: [],
    };
  }

  const proof = rawSources.map((source: any) => {
    const matched = source.rows.filter((row: any) => {
      if (state && row.location_state !== state) return false;
      if (maxPrice && Number(row.ask_price || 0) > maxPrice) return false;
      if (!rowMatchesMakes(row, makes)) return false;
      if (!rowMatchesQuery(row, q)) return false;
      return true;
    });
    return {
      id: source.id,
      status: source.error
        ? ("blocked" as const)
        : matched.length
          ? ("working" as const)
          : ("no_rows" as const),
      rows: source.rows.length,
      matchedRows: matched.length,
      detail: source.error,
    };
  });
  const rows = rawSources
    .flatMap((source: any) =>
      source.rows.map((row: any) => ({ ...row, source: source.id })),
    )
    .filter((row: any) => {
      if (state && row.location_state !== state) return false;
      if (maxPrice && Number(row.ask_price || 0) > maxPrice) return false;
      if (!rowMatchesMakes(row, makes)) return false;
      if (!rowMatchesQuery(row, q)) return false;
      return true;
    });

  return {
    proof,
    deals: rows.slice(0, 60).map((row: any) => {
      const analysis = analyzeDeal(
        {
          title: row.title,
          year: row.year,
          make: row.make,
          model: row.model,
          trim: row.trim,
          vin: row.vin,
          mileage: row.mileage,
          condition: row.condition,
          damage_type: row.damage_type,
          ask_price: Number(row.ask_price || 0),
          mmr_value: row.metadata?.acv_estimate || undefined,
          source: row.source,
          location_state: row.location_state,
          first_seen_at: row.scraped_at,
        } as any,
        {
          homeState: state && /^[A-Z]{2}$/.test(state) ? state : undefined,
        },
      );
      const deal = mapDeal(
        {
          id: `live-discover-${row.source}-${row.source_deal_id || row.source_url}`,
          source: row.source,
          source_url: row.source_url,
          title: row.title,
          year: row.year,
          make: row.make,
          model: row.model,
          vin: row.vin,
          mileage: row.mileage,
          condition: row.condition,
          damage_type: row.damage_type,
          ask_price: row.ask_price,
          location_city: row.location_city,
          location_state: row.location_state,
          images: row.images || [],
          first_seen_at: seenTimestampOrNull(row.scraped_at),
          last_seen_at: seenTimestampOrNull(row.scraped_at),
          auction_end_at: row.auction_end || row.auction_end_at,
          profit_score: analysis.score,
          true_net_profit: analysis.profit,
          recommended_max_bid: analysis.recommendedMaxBid,
          sell_estimate: analysis.sellEstimate,
          deal_verdict: analysis.verdict,
          repair_estimate: analysis.repairCost,
          transport_cost: analysis.transportCost,
          deal_analysis: {
            sellBasis: analysis.sellBasis,
            soldAnchored: analysis.soldAnchored,
            valuation: analysis.valuation,
            costs: {
              repair: analysis.repairCost,
              transport: analysis.transportCost,
              selling: analysis.sellingCost,
            },
            warnings: analysis.warnings,
            prediction: analysis.prediction,
          },
        },
        [],
      );
      return {
        ...deal,
        matchReasons: buyerScopeReasons(deal, { state, maxPrice, q, lane }),
      };
    }),
  };
}

export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, {
      key: "discover",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) return tooManyRequests(rl);

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state")?.toUpperCase();
    // Multi-state scope (the user's chosen states) — `?states=MO,IL`. Falls back to single `?state`.
    const scopeStates = (searchParams.get("states")?.split(",") ?? [])
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const maxPrice = parseInt(searchParams.get("maxPrice") || "0");
    const minPrice = parseInt(searchParams.get("minPrice") || "0");
    // Discover is an entry point, not an export. Keep the first response focused and let callers
    // opt into a slightly deeper rail without serializing the same vehicle hundreds of times.
    const requestedRailDepth = parseInt(searchParams.get("railDepth") || "12");
    const railDepth = Number.isFinite(requestedRailDepth)
      ? Math.min(Math.max(requestedRailDepth, 4), 24)
      : 12;
    const q = normalizeQuery(searchParams.get("q"));
    const lane = normalizeQuery(searchParams.get("lane"));
    const sellerType = normalizeQuery(searchParams.get("sellerType"));
    const titleType = normalizeQuery(searchParams.get("titleType"));
    const excludeRepairable = searchParams.get("includeRepairable") === "0";
    const dealerSourceIds = normalizeDealerSourceIds(
      searchParams.get("dealerSourceIds") ||
        searchParams.get("sourceId") ||
        searchParams.get("source"),
    );
    const makes = parseMakesParam(searchParams.get("makes"));
    const makesKey = makes.map((make) => make.toLowerCase()).join(",") || "any";

    if (!isSupabaseConfigured()) {
      const previewDeals = await cached(
        `discover:public-preview:${state || "all"}:${minPrice || 0}:${maxPrice || 0}:${q || "any"}:${lane || "all"}:${sellerType || "all"}:${titleType || "any"}:${dealerSourceIds.join("-") || "all"}:${makesKey}`,
        60_000,
        () =>
          publicPreviewDeals(
            state,
            maxPrice || undefined,
            q,
            lane || "all",
            sellerType || "all",
            dealerSourceIds,
            makes,
          ),
      );
      const eligiblePreview = previewDeals.deals.filter(
        (row: any) =>
          !excludeRepairable ||
          !hasReportedRepairRisk(row.condition, row.damageType),
      );
      return NextResponse.json({
        rails: eligiblePreview.length
          ? [
              {
                key: "public-preview",
                title: "Live Public Preview",
                subtitle:
                  "Real GovDeals and PublicSurplus rows while Supabase import is pending",
                // Preview has no saved desk: always the redacted card.
                deals: eligiblePreview.map((d: any) =>
                  redactListingForNonFlipDesk(d),
                ),
              },
            ]
          : [],
        totalListings: eligiblePreview.length,
        uniqueVehicles: eligiblePreview.length,
        marketListings: eligiblePreview.length,
        mergedDuplicates: 0,
        state: state || "nationwide",
        q: q || undefined,
        lane: lane || undefined,
        sellerType: sellerType || undefined,
        titleType: titleType || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        dealerSourceIds,
        makes: makes.length ? makes : undefined,
        personalized: false,
        configured: false,
        previewMode: true,
        previewProof: previewDeals.proof,
        coverage: unavailableCoverage(
          "Listings database is not connected; preview rows are live samples, not stored coverage.",
        ),
      });
    }

    // Cache the expensive part — the 5k-row pull + cross-source VIN dedup + grading — by state for
    // 45s, so the main feed paints instantly on repeat loads. Personalization (For You) is rebuilt
    // per-request below from this cached, graded set (cheap), so it stays current.
    const DISCOVER_ROW_CAP = 10000;
    const { merged, rowCount, marketListingCount, coverage } = await cached(
      `discover:${scopeStates.length ? scopeStates.join("-") : state || "all"}:${minPrice || 0}:${maxPrice || 0}:${q || "any"}:${lane || "any"}:${sellerType || "all"}:${titleType || "any"}:${dealerSourceIds.join("-") || "all"}:${makesKey}:repair-${excludeRepairable}`,
      45_000,
      async (): Promise<{
        merged: any[];
        rowCount: number;
        marketListingCount: number;
        coverage: DiscoverCoverage;
      }> => {
        const supabase = createServerComponentClient();
        // ONE index-driven pull via the discover_deals RPC. The old approach paged .range() up to 24k rows
        // across 24 round-trips — but the real cost was serializing 24k heavy rows (deal_analysis + options
        // JSONB) at ~10s. The RPC uses the idx_deals_last_seen_active partial index for the ORDER BY and caps
        // at 10k — verified to still cover all live sources (freshest 10k spans every one) — so it's ~2s, not
        // 18s. Returns one jsonb array (not row-capped by PostgREST). Cached 45s upstream.
        const { data: rpcData, error: rpcErr } = await supabase.rpc(
          "discover_deals",
          {
            p_state: scopeStates.length ? null : (state ?? null),
            p_states: scopeStates.length ? scopeStates : null,
            p_max_price: maxPrice || 0,
            p_limit: DISCOVER_ROW_CAP,
          },
        );
        if (rpcErr) throw new Error(rpcErr.message);
        const marketRows: any[] = Array.isArray(rpcData) ? rpcData : [];
        const rows: any[] = marketRows.filter((row: any) => {
          if (
            excludeRepairable &&
            hasReportedRepairRisk(row.condition, row.damage_type)
          )
            return false;
          if (
            dealLane(row) === "auction" &&
            !wantsAuctionInventory({
              lane,
              sellerType,
              sources: dealerSourceIds,
            })
          )
            return false;
          if (minPrice && Number(row.ask_price || 0) < minPrice) return false;
          if (q && !rowMatchesQuery(row, q)) return false;
          if (!matchesSellerType(row, sellerType || "all")) return false;
          if (
            titleType &&
            titleType !== "all" &&
            !rowTitleSignal(row).includes(titleType)
          )
            return false;
          if (
            dealerSourceIds.length &&
            !dealerSourceIdFromUrl(
              String(row.source_url || "").toLowerCase(),
              dealerSourceIds,
            )
          )
            return false;
          if (!rowMatchesMakes(row, makes)) return false;
          if (lane && lane !== "all") {
            const rowLane = dealLane(row);
            if (lane === "damaged") {
              if (rowLane !== "salvage" && rowLane !== "repairable")
                return false;
            } else if (lane === "government") {
              const source = String(row.source || "").toLowerCase();
              if (
                ![
                  "govdeals",
                  "gov_auction",
                  "publicsurplus",
                  "municibid",
                  "gsa_auctions",
                  "allsurplus",
                ].includes(source)
              )
                return false;
            } else if (rowLane !== lane) {
              return false;
            }
          }
          return true;
        });

        const byVin = new Map<string, any[]>();
        const noVin: any[] = [];
        for (const r of rows) {
          if (r.vin && String(r.vin).length === 17) {
            const k = String(r.vin).toUpperCase();
            if (!byVin.has(k)) byVin.set(k, []);
            byVin.get(k)!.push(r);
          } else {
            noVin.push(r);
          }
        }

        const m: any[] = [];
        byVin.forEach((group) => {
          group.sort((a, b) => Number(a.ask_price) - Number(b.ask_price));
          const [primary, ...rest] = group;
          const deal = mapDeal(
            primary,
            rest.map((r) => ({
              source: r.source,
              askPrice: Number(r.ask_price || 0),
              url: r.source_url,
            })),
          );
          m.push({
            ...deal,
            matchReasons: buyerScopeReasons(deal, {
              state: state || undefined,
              states: scopeStates,
              maxPrice: maxPrice || undefined,
              minPrice: minPrice || undefined,
              q,
              lane,
              titleType,
              dealerSourceIds,
            }),
          });
        });
        for (const r of noVin) {
          const deal = mapDeal(r, []);
          m.push({
            ...deal,
            matchReasons: buyerScopeReasons(deal, {
              state: state || undefined,
              states: scopeStates,
              maxPrice: maxPrice || undefined,
              minPrice: minPrice || undefined,
              q,
              lane,
              titleType,
              dealerSourceIds,
            }),
          });
        }
        return {
          merged: m,
          rowCount: rows.length,
          marketListingCount: marketRows.length,
          // Fresh rows (last 7 days) in the requested states, by source. Counted from the same
          // RPC rows, never estimated, so the UI can say when coverage is thin.
          coverage: buildDiscoverCoverage({
            marketRows,
            feedRows: rows,
            states: scopeStates.length ? scopeStates : state ? [state] : [],
            maxPrice: maxPrice || 0,
            rowCap: DISCOVER_ROW_CAP,
          }),
        };
      },
    );

    // ── Categorized rails ──
    const byGradeRank: Record<string, number> = {
      great: 3,
      good: 2,
      fair: 1,
      high: 0,
      unknown: -1,
    };
    // The same listing may belong to several rails. A bounded depth avoids a large initial payload
    // and leaves full, scoped browsing to Scan, which is paginated and filter-driven.
    const N = railDepth;

    const best = merged
      .filter((d) => d.grade === "great" || d.grade === "good")
      .sort((a, b) => b.discountPct - a.discountPct)
      .slice(0, N);

    const trucksSuvs = merged
      .filter((d) => d.segment === "truck" || d.segment === "suv")
      .sort(
        (a, b) =>
          byGradeRank[b.grade] - byGradeRank[a.grade] ||
          b.discountPct - a.discountPct,
      )
      .slice(0, N);

    const luxury = merged
      .filter(
        (d) => d.luxury || d.segment === "coupe" || d.segment === "convertible",
      )
      .sort((a, b) => byGradeRank[b.grade] - byGradeRank[a.grade])
      .slice(0, N);

    const budget = merged
      .filter((d) => d.priceTier === "budget")
      .sort(
        (a, b) =>
          byGradeRank[b.grade] - byGradeRank[a.grade] ||
          b.discountPct - a.discountPct,
      )
      .slice(0, N);

    const roiPool = merged.filter(
      (d) => d.dealVerdict === "go" || d.dealVerdict === "hold",
    );
    let roi = [...roiPool]
      .sort((a, b) => (b.profitScore || 0) - (a.profitScore || 0))
      .slice(0, N);

    const ev = merged.filter((d) => d.segment === "ev").slice(0, N);

    // Distressed-seller feed (Priceline Express Deal analog) — motivated sellers below market.
    const distressed = merged
      .filter((d) => d.distressed)
      .sort(
        (a, b) =>
          byGradeRank[b.grade] - byGradeRank[a.grade] ||
          b.discountPct - a.discountPct,
      )
      .slice(0, N);

    // Flash / Ending Soon (Booking urgency) — auctions closing within 24h, soonest first.
    const flash = merged
      .filter((d) => d.heat === "hot" || d.heat === "warm")
      .sort((a, b) => (a.hoursLeft ?? 1e9) - (b.hoursLeft ?? 1e9))
      .slice(0, N);

    // "New to MikeHunt": first seen inside JUST_LISTED_WINDOW_HOURS, newest first. We do not know
    // when the seller posted it, only when we first saw it, so the rail says that. Undated rows and
    // rows first seen earlier stay out instead of padding the rail with old inventory.
    const fresh = justListedRail(merged, Date.now(), N);

    // ── Channel lanes (the curated salvage-network payoff) — group by dealLane so a dealer can browse
    // the whole state by risk channel: branded/total-loss, fixable, and live auction lots, each sorted
    // best-deal-first. These only populate once the salvage/rebuilder sites are categorized correctly.
    const laneRail = (lane: string) =>
      merged
        .filter((d) => d.lane === lane)
        .sort(
          (a, b) =>
            byGradeRank[b.grade] - byGradeRank[a.grade] ||
            b.discountPct - a.discountPct,
        )
        .slice(0, N);
    const salvage = laneRail("salvage");
    const repairable = laneRail("repairable");
    const auctionLots = laneRail("auction");

    // ── Personalized "For You" rail ──
    // Saved buyerScope (vehicle, title, timeline, repair, mode) plus profile home_state.
    // Personal buyers are ranked by scope match then recency — not profit — and non-matches
    // stay in the rail (repairCapability "none" is the only drop). Flip/dealer modes keep a
    // profit gate, re-ranked with transport to the buyer's home state. The displayed dollar
    // is not rewritten.
    let forYou: any[] = [];
    let forYouSubtitle = "Matched to your saved search";
    let personalized = false;
    try {
      const {
        data: { user },
      } = await getServerUser();
      if (user?.id) {
        const supabase = createServerComponentClient();
        const [{ data: profile }, { data: prefRow }] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("home_state, preferred_makes, budget_max, target_profit")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("user_preferences")
            .select("prefs")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        const scope = ((
          prefRow?.prefs as { buyerScope?: BuyerScopePrefs } | null
        )?.buyerScope || {}) as BuyerScopePrefs;
        // "Where you live": prefs.homeLocation (Settings/onboarding) first, then the legacy
        // user_profiles.home_state column.
        const usableHome = discoverHomeState(
          (prefRow?.prefs as { homeLocation?: unknown } | null)?.homeLocation,
          profile?.home_state,
        );
        const makes = [
          ...((profile?.preferred_makes as string[] | null) || []),
          ...((scope as { makes?: string[] }).makes || []),
          ...((scope as { preferredMakes?: string[] }).preferredMakes || []),
        ]
          .map((m) => String(m).toLowerCase())
          .filter(Boolean);
        const maxPrice =
          Number(profile?.budget_max) || Number(scope.maxPrice) || 0;
        const minProfit = Number(profile?.target_profit) || 0;
        const hasScope =
          !!usableHome ||
          makes.length > 0 ||
          maxPrice > 0 ||
          !!scope.vehicle ||
          !!scope.vehicleType ||
          (!!scope.titleType && scope.titleType !== "all") ||
          !!scope.buyerMode ||
          !!scope.timeline ||
          !!scope.repairCapability;
        if (usableHome) {
          roi = [...roiPool]
            .sort((a, b) => compareFlip(a, b, usableHome))
            .slice(0, N);
        }
        if (hasScope) {
          personalized = true;
          const repair =
            scope.includeRepairable === true
              ? undefined
              : scope.repairCapability;
          if (isFlipMode(scope.buyerMode)) {
            forYouSubtitle =
              "Matched to your states, budget, and profit target";
            forYou = merged
              .filter((d) => {
                if (dropsForNoRepair(d, repair)) return false;
                if (
                  usableHome &&
                  (d.locationState || "").toUpperCase() !== usableHome
                )
                  return false;
                if (
                  makes.length &&
                  !makes.includes((d.make || "").toLowerCase())
                )
                  return false;
                if (maxPrice > 0 && d.askPrice > maxPrice) return false;
                if (minProfit > 0) {
                  const profit = transportAdjustedProfit(d, usableHome);
                  if ((profit ?? 0) < minProfit) return false;
                }
                return true;
              })
              .sort(
                (a, b) =>
                  byGradeRank[b.grade] - byGradeRank[a.grade] ||
                  compareFlip(a, b, usableHome),
              )
              .slice(0, N);
          } else {
            forYouSubtitle = "Matched to your saved search, newest first";
            forYou = merged
              .filter((d) => !dropsForNoRepair(d, repair))
              .sort((a, b) => comparePersonal(a, b, scope, makes, usableHome))
              .slice(0, N);
          }
        }
      }
    } catch {
      // Anonymous / no profile — just skip personalization, feed still works.
    }

    const rails = [
      ...(forYou.length > 0
        ? [
            {
              key: "foryou",
              title: "⭐ For You",
              subtitle: forYouSubtitle,
              deals: forYou,
            },
          ]
        : []),
      {
        key: "flash",
        title: "⏳ Ending Soon",
        subtitle: "Auctions closing within 24h",
        deals: flash,
      },
      {
        key: "best",
        title: "Best Deals",
        subtitle: "Biggest discounts vs market",
        deals: best,
      },
      {
        key: "distressed",
        title: "Motivated Sellers",
        // isDistressed() is listing wording (repo, estate, must sell, OBO…) or a Great Deal grade.
        // Wording alone says nothing about price, so the subtitle does not claim "below market".
        subtitle: "Repo, estate or must-sell wording, or a Great Deal grade",
        deals: distressed,
      },
      {
        key: "roi",
        title: "Top Flips",
        subtitle: "Highest profit potential",
        deals: roi,
      },
      {
        key: "salvage",
        title: "🔴 Salvage",
        subtitle: "Branded / total-loss — salvage-yard & dealer supply",
        deals: salvage,
      },
      {
        key: "repairable",
        title: "🟠 Repairable",
        subtitle: "Rebuildable cars from the rebuilder network",
        deals: repairable,
      },
      {
        key: "auctionLots",
        title: "🟡 Auction Lots",
        subtitle: "Live auction inventory (Copart/IAA/ADESA & gov)",
        deals: auctionLots,
      },
      {
        key: "trucks",
        title: "Trucks & SUVs",
        subtitle: "Browse trucks and SUVs matching your search",
        deals: trucksSuvs,
      },
      {
        key: "budget",
        title: "Under $10k",
        subtitle: "Reported prices under $10,000; verify terms and condition",
        deals: budget,
      },
      {
        key: "luxury",
        title: "Luxury & Performance",
        subtitle: "Premium picks",
        deals: luxury,
      },
      { key: "ev", title: "Electric", subtitle: "EVs & hybrids", deals: ev },
      {
        key: "fresh",
        title: "New to MikeHunt",
        subtitle: `First seen in the last ${JUST_LISTED_WINDOW_HOURS} hours`,
        deals: fresh,
      },
    ].filter((r) => r.deals.length > 0);

    // Net profit, max bid, profit score, and seller contact only go to a saved reseller / dealer
    // desk. Everyone else (signed out, personal, diy, parts, unknown, prefs error) gets redacted
    // cards, and the wholesale flip rails (Top Flips, Auction Lots, New to MikeHunt, and Salvage
    // except for parts) are dropped here, not just hidden by the page. Cards are copied, never
    // mutated, because `merged` is cached.
    const desk = await resolveCallerDesk();
    const flipDesk = desk === "flip";
    const deskRails = flipDesk
      ? rails
      : filterRailsForDesk(rails, desk).map((r) => ({
          ...r,
          deals: r.deals.map((d: any) => redactListingForNonFlipDesk(d)),
        }));

    return NextResponse.json({
      rails: deskRails,
      deskAccess: flipDesk ? "flip" : "personal",
      totalListings: rowCount,
      uniqueVehicles: merged.length,
      marketListings: marketListingCount,
      mergedDuplicates: rowCount - merged.length,
      state: state || "nationwide",
      q: q || undefined,
      lane: lane || undefined,
      sellerType: sellerType || undefined,
      titleType: titleType || undefined,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      dealerSourceIds,
      makes: makes.length ? makes : undefined,
      personalized,
      configured: true,
      previewMode: false,
      coverage,
    });
  } catch (e: any) {
    return internalError("discover", e);
  }
}
