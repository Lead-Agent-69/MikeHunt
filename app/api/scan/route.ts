import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { hasReportedRepairRisk } from "@/lib/intelligence/repair-risk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";
import { previewPublicSurplus } from "@/lib/scrapers/sources/publicsurplus";
import { gradeDataQuality } from "@/lib/data-quality";
import { LocalScraperCache } from "@/lib/scrapers/local-cache";
import { analyzeDeal } from "@/lib/scoring/deal-analyzer";
import { sellerContact } from "@/lib/data/deal-contact";
import {
  redactListingForNonFlipDesk,
  resolveCallerAccess,
  redactSellerForGuest,
} from "@/lib/deals/deal-desk-access";
import type { DiscoverDesk } from "@/lib/discovery/desk-rails";
import { isAutomationAllowedSource } from "@/lib/scrapers/sweep-schedule";
import { displaySource, sourceMeta } from "@/lib/sources/source-meta";
import { matchesVehicleQuery } from "@/lib/search/vehicle-query";
import { expandFreeTextQuery } from "@/lib/search/expand-free-text";
import {
  applyZipRadiusBox,
  milesFrom,
  resolveZipRadius,
} from "@/lib/search/zip-radius";
import { hasVehicleCategoryQuery } from "@/lib/discovery/for-you-rank";
import {
  CATEGORY_PROJECTION,
  matchingCategoryIds,
} from "@/lib/search/category-inventory";
import { cached } from "@/lib/cache";
import {
  SCAN_EXTRA_KEYS,
  hasAuctionDetailFilters,
} from "@/lib/search/extended-inventory-filters";
import {
  uniqueDbSources,
  sellerTypeSourceValues,
  sourceUrlNeedles,
  applyVehicleDetails,
  applyInventoryLane,
  applyRepairEligibility,
  validateInventoryRanges,
} from "@/lib/search/inventory-filters";
import {
  AUCTION_DB_SOURCES,
  wantsAuctionInventory,
} from "@/lib/discovery/auction-scope";
import { seenTimestampOrNull } from "@/lib/deals/listing-freshness";
import {
  parseTitleTypes,
  titleCategory,
  titleCategoryOrFilter,
  titleSourceOf,
} from "@/lib/deals/title-category";

// Keep list responses lean. Cards do not need every stored scraper field, and selecting only
// the fields used below reduces database serialization and transfer time on every search.
const SCAN_SELECT =
  "id,source,title,year,make,model,trim,body_class,recalls_count,assembly_country,vin,mileage,condition,damage_type,location_city,location_state,location_zip,ask_price,buy_now_price,mmr_value,profit_estimate,profit_score,deal_verdict,recommended_max_bid,sell_estimate,true_net_profit,deal_analysis,images,source_url,first_seen_at,last_seen_at,auction_end_at,estimated_repair_cost,estimated_transport_cost,is_arbitrage_opportunity,active,options,lat,lng";

const SCAN_CACHE_HEADERS = {
  // Response is desk-scoped (flip economics redacted for non-flip / signed-out). A public
  // CDN cache would let a flip-desk payload leak to everyone else — never share across users.
  "Cache-Control": "private, no-store",
};

// LAZY client — created at REQUEST time, never at module load. `next build` evaluates route modules
// without the runtime env, and createClient("","") throws on an empty URL → that top-level call was
// failing the whole build ("Failed to collect page data for /api/scan") and freezing every deploy.
let _supabase: SupabaseClient | null = null;
function db() {
  // Service-role server client: SCAN_SELECT reads economics columns the anon role is not granted
  // (20261010020000_deals_column_grants.sql). The desk gate below decides what the caller sees.
  if (!_supabase) _supabase = createServerComponentClient();
  return _supabase;
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowOptions(row: any) {
  return row && typeof row.options === "object" && row.options
    ? row.options
    : {};
}

function inferredSeller(row: any) {
  const options = rowOptions(row);
  const directSeller = String(row.seller || options.seller || "").trim();
  const directSellerType = String(
    row.seller_type || row.sellerType || options.sellerType || "",
  ).trim();
  const sourceKey = displaySource(row.source, row.source_url || row.sourceUrl);
  const meta = sourceMeta(sourceKey);
  const contact = sellerContact(row);
  return {
    seller:
      directSeller ||
      contact.phone ||
      contact.email ||
      (row.source_url || row.sourceUrl ? meta.label : undefined),
    sellerType:
      directSellerType ||
      (meta.channel === "gov" ||
      meta.channel === "auction" ||
      meta.channel === "salvage" ||
      meta.channel === "wholesale"
        ? "auction"
        : meta.channel === "dealer" || meta.channel === "retail"
          ? "dealer"
          : meta.channel === "private"
            ? "private"
            : undefined),
  };
}

function rowBidCount(row: any) {
  const options = rowOptions(row);
  const bidCount = row.bid_count ?? row.bidCount ?? options.auction?.bidCount;
  return bidCount != null && Number.isFinite(Number(bidCount))
    ? Number(bidCount)
    : undefined;
}

function inferredTitleType(row: any) {
  const explicit =
    row.title_type || row.titleType || row.title_status || row.titleStatus;
  if (explicit) return explicit;
  const condition = String(row.condition || "").toLowerCase();
  if (condition.includes("salvage")) return "salvage";
  if (condition.includes("rebuilt")) return "rebuilt";
  if (condition.includes("clean")) return "clean";
  if (condition.includes("parts")) return "parts only";
  return undefined;
}

type ScanMatchFilters = {
  q?: string;
  lane?: string;
  state?: string;
  states?: string[];
  make?: string;
  makes?: string[];
  model?: string;
  titleType?: string;
  sellerType?: string;
  minPrice?: number;
  maxPrice?: number;
  source?: string;
  dealer?: string;
  dealers?: string[];
  dealerSourceIds?: string[];
};

function labelList(values: string[] | undefined, max = 2) {
  const clean = (values || []).filter(Boolean);
  if (!clean.length) return "";
  const shown = clean.slice(0, max).join("/");
  return clean.length > max ? `${shown} +${clean.length - max}` : shown;
}

function freshnessReason(value: unknown) {
  if (!value) return null;
  const time = new Date(value as any).getTime();
  if (!Number.isFinite(time)) return null;
  const hours = Math.max(0, Math.round((Date.now() - time) / 3_600_000));
  if (hours < 1) return "seen this hour";
  if (hours < 24) return `${hours}h fresh`;
  return `${Math.round(hours / 24)}d fresh`;
}

export function buildScanMatchExplanation(
  row: any,
  filters: ScanMatchFilters = {},
) {
  const reasons: string[] = [];
  const stateFilter =
    filters.state &&
    !["all", "nationwide"].includes(filters.state.toLowerCase())
      ? filters.state.toUpperCase()
      : filters.states?.length
        ? labelList(
            filters.states.map((state) => state.toUpperCase()),
            3,
          )
        : "";
  if (stateFilter && row?.locationState) {
    reasons.push(`${row.locationState} matches selected market`);
  }
  if (filters.lane && filters.lane !== "all") {
    reasons.push(`${filters.lane.replace(/-/g, " ")} lane`);
  }
  const makeFocus = filters.makes?.length
    ? labelList(filters.makes, 3)
    : filters.make || "";
  if (makeFocus && row?.make) {
    reasons.push(`${row.make} matches make focus`);
  }
  if (filters.model && row?.model) {
    reasons.push(`${row.model} matches model focus`);
  }
  if (filters.titleType && filters.titleType !== "all" && row?.titleType) {
    reasons.push(`${String(row.titleType).replace(/_/g, " ")} title match`);
  }
  if (filters.sellerType && filters.sellerType !== "all") {
    reasons.push(`${filters.sellerType} seller scope`);
  }
  if (filters.minPrice && row?.askPrice && row.askPrice >= filters.minPrice) {
    reasons.push(`over $${Number(filters.minPrice).toLocaleString()} budget`);
  }
  if (filters.maxPrice && row?.askPrice && row.askPrice <= filters.maxPrice) {
    reasons.push(`under $${Number(filters.maxPrice).toLocaleString()} budget`);
  }
  if (filters.q) {
    reasons.push(`matches "${filters.q}" search`);
  }
  if (filters.dealerSourceIds?.length) {
    reasons.push(
      `${labelList(
        filters.dealerSourceIds.map((id) => sourceMeta(id).label),
        2,
      )} dealer target`,
    );
  } else if (filters.dealer || filters.dealers?.length) {
    reasons.push("watched dealer target");
  } else if (filters.source && filters.source !== "all") {
    reasons.push(`${sourceMeta(filters.source).label} source`);
  }
  return reasons.slice(0, 7);
}

/** What /api/scan tells the client about economics: only a saved reseller/dealer desk is "flip". */
export type ScanDeskAccess = "flip" | "personal";

export function deskAccessFor(desk: DiscoverDesk): ScanDeskAccess {
  return desk === "flip" ? "flip" : "personal";
}

function valuationReason(valuation: any, flipDesk: boolean) {
  // Flip desks read the number as a resale target; everyone else reads it as market value.
  const noun = flipDesk ? "Resale estimate" : "Market value";
  if (valuation?.source === "comparables" || valuation?.basis === "comps")
    return `${noun} is comp-backed`;
  if (valuation?.source === "third_party")
    return `${noun} uses a third-party market anchor`;
  if (valuation?.source === "historical_estimate")
    return `${noun} uses active-listing history, not sold comps`;
  if (valuation?.source === "asking_price")
    return `${noun} is anchored to the seller asking price`;
  if (valuation?.basis === "market")
    return `${noun} uses a market signal that still needs comp verification`;
  if (valuation?.basis === "baseline") return `${noun} uses a modeled baseline`;
  return null;
}

/**
 * Why a row is shown and what to check next. `desk` decides the wording: flip desks get resale,
 * spread, and max-bid language; personal / diy / parts desks (and signed-out callers) get
 * buyer language and never a profit, verdict, or max-bid line, even if the row still carries one.
 * Defaults to "flip" only for back-compat with direct callers; the route always passes the
 * caller's resolved desk.
 */
export function buildTrustExplanation(
  row: any,
  filters: ScanMatchFilters = {},
  desk: DiscoverDesk = "flip",
) {
  const flipDesk = desk === "flip";
  const qualityScore = Number(row?.dataQuality?.score || 0);
  const profit = Number(row?.profitEstimate ?? row?.true_net_profit ?? 0);
  const profitScore = Number(row?.profitScore || 0);
  const repairEstimate = Number(
    row?.repairEstimate ?? row?.repair_estimate ?? 0,
  );
  const transportEstimate = Number(
    row?.transportEstimate ?? row?.transport_cost ?? 0,
  );
  const valuation =
    row?.valuation ||
    row?.dealAnalysis?.valuation ||
    row?.deal_analysis?.valuation;
  const compCount = Number(valuation?.compCount || 0);
  const soldCount = Number(valuation?.soldCount || 0);
  const recommendedMaxBid = Number(
    row?.recommendedMaxBid ?? row?.recommended_max_bid ?? 0,
  );
  const verdict = String(
    row?.dealVerdict || row?.deal_verdict || "",
  ).toLowerCase();
  const matchReasons = buildScanMatchExplanation(row, filters);
  const flipReasons = [
    verdict === "go"
      ? "BUY verdict from profit and proof scoring"
      : verdict === "hold" || verdict === "watch"
        ? "Watch verdict until proof or price improves"
        : verdict === "pass"
          ? "Pass verdict unless assumptions change"
          : null,
    recommendedMaxBid > 0
      ? `$${Math.round(recommendedMaxBid).toLocaleString()} recommended max buy`
      : null,
  ];
  const reasons = [
    ...matchReasons,
    ...(flipDesk ? flipReasons : []),
    compCount > 0 || soldCount > 0
      ? `${compCount + soldCount} valuation comp${compCount + soldCount === 1 ? "" : "s"}`
      : null,
    valuationReason(valuation, flipDesk),
    row?.sourceUrl ? "Original source link is present" : null,
    repairEstimate > 0
      ? `$${Math.round(repairEstimate).toLocaleString()} repair estimate`
      : null,
    transportEstimate > 0
      ? `$${Math.round(transportEstimate).toLocaleString()} transport estimate`
      : null,
    row?.vin ? "VIN captured" : null,
    row?.mileage ? "Mileage captured" : null,
    freshnessReason(row?.lastSeenAt || row?.firstSeenAt),
    row?.images?.length
      ? `${row.images.length} photo${row.images.length === 1 ? "" : "s"}`
      : null,
    row?.auctionEndAt ? "Auction end is known" : null,
    row?.seller || row?.sellerType ? "Seller/source is identified" : null,
    flipDesk && profit > 0
      ? `$${Math.round(profit).toLocaleString()} estimated spread`
      : null,
  ].filter(Boolean) as string[];
  const missing = (row?.dataQuality?.missing || []).slice(0, 4);
  const nextChecks = (
    flipDesk
      ? [
          row?.vin ? null : "verify VIN",
          row?.mileage ? null : "verify mileage",
          repairEstimate > 0 ? null : "verify repair estimate",
          transportEstimate > 0 ? null : "confirm transport quote",
          compCount || soldCount ? null : "verify comparable resale comps",
          row?.titleType ? null : "confirm title type",
          row?.sellerPhone || row?.sellerEmail || row?.sellerContactUrl
            ? null
            : "find seller contact path",
          row?.auctionEndAt ? null : "confirm auction timing",
          profitScore || profit ? null : "validate resale and fee math",
          recommendedMaxBid > 0 ? null : "set max bid before contacting seller",
        ]
      : [
          row?.vin ? null : "ask the seller for the VIN",
          row?.mileage ? null : "confirm mileage",
          row?.titleType ? null : "confirm title type",
          desk === "parts"
            ? "confirm which parts are usable before you buy"
            : "get a pre-purchase inspection",
          compCount || soldCount ? null : "compare against similar listings",
          row?.auctionEndAt ? "check the auction end time" : null,
          row?.sourceUrl
            ? "contact the seller through the original listing"
            : "find the original listing before contacting anyone",
        ]
  ).filter(Boolean) as string[];
  // Complete listing fields are useful, but they are not the same as a verified
  // resale basis. Do not present an asking-price estimate as a high-confidence buy.
  const hasIndependentValuation =
    compCount > 0 || soldCount > 0 || valuation?.source === "third_party";
  const confidence =
    qualityScore >= 80 && reasons.length >= 5 && hasIndependentValuation
      ? "high"
      : qualityScore >= 60 && reasons.length >= 3
        ? "medium"
        : "low";
  return {
    confidence,
    score: scanTrustScore(row, { includeProfit: flipDesk }),
    reasons: reasons.slice(0, 10),
    missing,
    nextChecks: nextChecks.slice(0, 5),
    summary: reasons.length
      ? reasons.slice(0, 3).join(" · ")
      : "Thin proof: verify original listing details before acting.",
  };
}

function normalizeRow(r: any, table: "deals" | "vehicles") {
  // Map both deals and vehicles rows into a Deal-like shape used by scan UI mapper
  const id = r.id;
  const source = r.source || "unknown";
  const year = r.year ?? undefined;
  const make = r.make || "";
  const model = r.model || "";
  const mileage = r.mileage ?? r.miles ?? undefined;
  const askPrice = toNum(r.ask_price ?? r.askPrice ?? 0);
  const mmrValue = toNum(r.mmr_value ?? r.mmrValue ?? r.market_value ?? 0);
  const profitEstimate = toNum(r.profit_estimate ?? r.profitEstimate ?? 0);
  const profitScore = r.profit_score ?? r.profitScore ?? undefined;
  const condition = r.condition || "";
  const damageType = r.damage_type || r.damageType || undefined;
  const titleType = inferredTitleType(r);
  const locationCity = r.location_city || r.locationCity || undefined;
  const locationState = r.location_state || r.locationState || undefined;
  const sellerProof = inferredSeller(r);
  const seller = sellerProof.seller || undefined;
  const contact = sellerContact(r);
  const auctionEndAt =
    r.auction_end || r.auction_end_at || r.auctionEndAt || undefined;
  const repairEst = toNum(
    r.repair_estimate ?? r.repairEst ?? r.estimated_repair_cost ?? 0,
  );
  const images = Array.isArray(r.images) ? r.images : r.images || [];
  const quality = gradeDataQuality({
    images,
    imageUrl: images[0],
    vin: r.vin,
    titleType,
    condition,
    damageType,
    mileage,
    locationCity,
    locationState,
    askPrice,
    seller,
    sellerType: sellerProof.sellerType,
    sellerPhone: contact.phone,
    sellerEmail: contact.email,
    sellerContactUrl: contact.url,
    auctionEndAt,
    sourceUrl: r.source_url || r.sourceUrl,
  });
  const normalized = {
    id,
    source,
    title: r.title || `${year || ""} ${make} ${model}`.trim(),
    year,
    make,
    model,
    trim: r.trim,
    bodyClass: r.body_class || undefined,
    recallsCount: r.recalls_count ?? undefined,
    assemblyCountry: r.assembly_country || undefined,
    vin: r.vin,
    mileage,
    condition,
    titleType,
    titleCategory: titleCategory({ condition: r.condition }),
    titleSource: titleSourceOf(r),
    askPrice,
    buyNowPrice: r.buy_now_price ?? undefined,
    mmrValue,
    profitEstimate,
    profitScore: profitScore != null ? Number(profitScore) : undefined,
    // Decision-engine fields — must be carried through so verdict pills / max-bid /
    // resale render on the Scan grid (mapDealToResult reads these camelCase keys).
    dealVerdict: r.deal_verdict || undefined,
    recommendedMaxBid:
      r.recommended_max_bid != null ? Number(r.recommended_max_bid) : undefined,
    sellEstimate: r.sell_estimate != null ? Number(r.sell_estimate) : undefined,
    true_net_profit:
      r.true_net_profit != null ? Number(r.true_net_profit) : undefined,
    dealAnalysis: r.deal_analysis || r.dealAnalysis || undefined,
    sellBasis:
      r.sell_basis ||
      r.sellBasis ||
      r.deal_analysis?.sellBasis ||
      r.dealAnalysis?.sellBasis ||
      r.deal_analysis?.valuation?.basis ||
      r.dealAnalysis?.valuation?.basis ||
      undefined,
    valuation:
      r.valuation ||
      r.deal_analysis?.valuation ||
      r.dealAnalysis?.valuation ||
      undefined,
    soldAnchored:
      r.sold_anchored ??
      r.soldAnchored ??
      r.deal_analysis?.soldAnchored ??
      r.dealAnalysis?.soldAnchored,
    images,
    locationCity,
    locationState,
    locationZip: r.location_zip || undefined,
    active: r.active ?? true,
    // Never invent now(): a missing timestamp must read "Freshness unknown", not "just now".
    firstSeenAt: seenTimestampOrNull(r.first_seen_at ?? r.firstSeenAt),
    lastSeenAt: seenTimestampOrNull(r.last_seen_at ?? r.lastSeenAt),
    sourceUrl: r.source_url || r.sourceUrl || "",
    seller,
    sellerType: sellerProof.sellerType || undefined,
    sellerPhone: contact.phone,
    sellerEmail: contact.email,
    sellerContactUrl: contact.url,
    auctionEndAt: auctionEndAt ? new Date(auctionEndAt) : undefined,
    bidCount: rowBidCount(r),
    damageType,
    repair_estimate: repairEst || undefined,
    transport_cost: r.transport_cost ?? r.estimated_transport_cost ?? undefined,
    is_arbitrage_opportunity: r.is_arbitrage_opportunity ?? undefined,
    dataQuality: {
      score: quality.score,
      label: quality.label,
      missing: quality.missing,
    },
  };
  // Placeholder only: GET rebuilds trustExplanation with the caller's desk and filters.
  return {
    ...normalized,
    trustExplanation: buildTrustExplanation(normalized, {}, "personal"),
  };
}

function dedupeKey(r: any) {
  return `${(r.source || "unknown").toLowerCase()}::${r.source_deal_id || r.id || r.vin || ""}`;
}

export {
  dbSourceValues,
  uniqueDbSources,
  sellerTypeSourceValues,
  sourceUrlNeedles,
  damagedLaneFilter,
} from "@/lib/search/inventory-filters";

export function normalizePageSize(value: string | null) {
  const parsed = parseInt(value || "48", 10);
  if (!Number.isFinite(parsed)) return 48;
  return Math.min(100, Math.max(1, parsed));
}

export type ScanSort =
  | "profit"
  | "score"
  | "price"
  | "price-desc"
  | "newest"
  | "year"
  | "mileage";

export function normalizeScanSort(value: string | null): ScanSort {
  if (
    value === "score" ||
    value === "price" ||
    value === "price-desc" ||
    value === "newest" ||
    value === "year" ||
    value === "mileage"
  )
    return value;
  return "profit";
}

/**
 * Profit sort ranks rows by true_net_profit, a flip-only number. Off the flip desk the ordering
 * itself would leak it, so a non-flip caller asking for profit gets the trust/proof ranking.
 */
export function scanSortForDesk(sort: ScanSort, flipDesk: boolean): ScanSort {
  return !flipDesk && sort === "profit" ? "score" : sort;
}

export function scanSortOrder(sort: ScanSort) {
  if (sort === "price-desc")
    return { column: "ask_price", ascending: false, nullsFirst: false };
  if (sort === "newest")
    return { column: "first_seen_at", ascending: false, nullsFirst: false };
  if (sort === "year")
    return { column: "year", ascending: false, nullsFirst: false };
  if (sort === "mileage")
    return { column: "mileage", ascending: true, nullsFirst: false };
  if (sort === "price") {
    return { column: "ask_price", ascending: true, nullsFirst: false };
  }
  if (sort === "score") {
    return { column: "last_seen_at", ascending: false, nullsFirst: false };
  }
  return { column: "true_net_profit", ascending: false, nullsFirst: false };
}

export function scanTrustScore(
  row: any,
  options: { includeProfit?: boolean } = {},
) {
  const includeProfit = options.includeProfit ?? true;
  const qualityScore = Number(row?.dataQuality?.score || 0);
  // profitScore is flip economics; non-flip ranking must not depend on it.
  const profitScore = includeProfit ? Number(row?.profitScore || 0) : 0;
  const proofScore =
    (row?.vin ? 14 : 0) +
    (row?.mileage ? 12 : 0) +
    (row?.images?.length ? 12 : 0) +
    (row?.sourceUrl ? 10 : 0) +
    (row?.auctionEndAt ? 8 : 0) +
    (row?.seller ? 6 : 0) +
    (row?.sellerContactUrl || row?.sellerPhone || row?.sellerEmail ? 5 : 0);
  return qualityScore * 0.55 + profitScore * 0.25 + proofScore * 0.2;
}

export function sortScanRows(
  rows: any[],
  sort: ScanSort,
  state?: string,
  options: { includeProfit?: boolean } = {},
) {
  const stateCode = state?.toUpperCase();
  const sorted = [...rows].sort((a, b) => {
    if (stateCode) {
      const aState = (a.locationState || "").toUpperCase() === stateCode;
      const bState = (b.locationState || "").toUpperCase() === stateCode;
      if (aState !== bState) return aState ? -1 : 1;
    }

    if (sort === "score")
      return scanTrustScore(b, options) - scanTrustScore(a, options);
    return 0;
  });
  return sorted;
}

export function isWatchCandidateVerdict(value: string | null) {
  return (value || "").toLowerCase() === "watch";
}

function applySourceUrlNeedles(query: any, sourceId: string) {
  const needles = sourceUrlNeedles(sourceId);
  if (!needles.length) return query;
  return needles.length === 1
    ? query.ilike("source_url", `%${needles[0]}%`)
    : query.or(
        needles.map((needle) => `source_url.ilike.%${needle}%`).join(","),
      );
}

export function sourceUrlNeedleFilter(sourceIds: string[]) {
  const needles = Array.from(
    new Set(sourceIds.flatMap((sourceId) => sourceUrlNeedles(sourceId))),
  );
  return needles.map((needle) => `source_url.ilike.%${needle}%`).join(",");
}

function matchesPublicScope(
  row: any,
  filters: {
    q: string;
    state: string;
    maxPrice: number;
    minPrice: number;
    source: string;
  },
) {
  if (
    filters.source &&
    filters.source !== "all" &&
    row.source !== filters.source
  )
    return false;
  if (
    filters.state &&
    filters.state.toLowerCase() !== "all" &&
    filters.state.toLowerCase() !== "nationwide" &&
    String(row.location_state || "").toUpperCase() !==
      filters.state.toUpperCase()
  )
    return false;
  const price = toNum(row.ask_price ?? row.askPrice);
  if (filters.maxPrice > 0 && price > filters.maxPrice) return false;
  if (filters.minPrice > 0 && price < filters.minPrice) return false;
  if (filters.q) {
    if (!matchesVehicleQuery(row, filters.q)) return false;
  }
  return true;
}

function matchesVehicleScope(
  vehicle: any,
  filters: {
    q: string;
    state: string;
    maxPrice: number;
    minPrice: number;
    source: string;
    allowedSources?: string[];
  },
) {
  if (
    filters.allowedSources?.length &&
    !filters.allowedSources.includes(String(vehicle.source || ""))
  )
    return false;
  return matchesPublicScope(
    {
      source: vehicle.source,
      title: vehicle.title,
      make: vehicle.make,
      model: vehicle.model,
      location_state: vehicle.locationState,
      ask_price: vehicle.askPrice,
    },
    filters,
  );
}

function publicRowToVehicle(
  row: any,
  sourceId?: string,
  desk: DiscoverDesk = "personal",
) {
  const canonicalSource = sourceId || row.source;
  const sellerProof = inferredSeller({
    ...row,
    source: canonicalSource,
  });
  const contact = sellerContact(row);
  const analysis = analyzeDeal({
    title: row.title,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    vin: row.vin,
    mileage: row.mileage,
    condition: row.condition,
    damage_type: row.damage_type,
    ask_price: toNum(row.ask_price),
    mmr_value: row.metadata?.acv_estimate || undefined,
    source: canonicalSource,
    location_state: row.location_state,
    first_seen_at: row.scraped_at,
  } as any);
  const quality = gradeDataQuality({
    images: row.images,
    vin: row.vin,
    titleType:
      row.title_type ||
      row.titleType ||
      row.title_status ||
      row.titleStatus ||
      String(row.title || "").match(
        /salvage|rebuilt|clean title|parts/i,
      )?.[0] ||
      null,
    condition: row.condition,
    damageType: row.damage_type,
    mileage: row.mileage,
    locationCity: row.location_city,
    locationState: row.location_state,
    askPrice: row.ask_price,
    seller: sellerProof.seller,
    sellerType: sellerProof.sellerType,
    sellerPhone: contact.phone,
    sellerEmail: contact.email,
    sellerContactUrl: contact.url,
    auctionEndAt: row.auction_end || row.auction_end_at || row.auctionEndAt,
    sourceUrl: row.source_url,
  });
  const mapped = {
    id: `live-${canonicalSource}-${row.source_deal_id || row.id || row.vin || Math.random().toString(36).slice(2)}`,
    source: canonicalSource,
    title: row.title,
    year: row.year,
    make: row.make,
    model: row.model,
    vin: row.vin,
    mileage: row.mileage,
    condition: row.condition,
    damageType: row.damage_type,
    askPrice: toNum(row.ask_price),
    mmrValue: analysis.mmrValue || 0,
    profitEstimate: analysis.profit,
    profitScore: analysis.score,
    dealVerdict: analysis.verdict,
    recommendedMaxBid: analysis.recommendedMaxBid,
    sellEstimate: analysis.sellEstimate,
    true_net_profit: analysis.profit,
    repair_estimate: analysis.repairCost,
    transport_cost: analysis.transportCost,
    warnings: analysis.warnings,
    images: row.images || [],
    locationCity: row.location_city,
    locationState: row.location_state,
    sourceUrl: row.source_url,
    seller: sellerProof.seller,
    sellerType: sellerProof.sellerType,
    sellerPhone: contact.phone,
    sellerEmail: contact.email,
    sellerContactUrl: contact.url,
    auctionEndAt: row.auction_end || row.auction_end_at || row.auctionEndAt,
    bidCount: rowBidCount(row),
    firstSeenAt: seenTimestampOrNull(row.scraped_at),
    lastSeenAt: seenTimestampOrNull(row.scraped_at),
    dataQuality: {
      score: quality.score,
      label: quality.label,
      missing: quality.missing,
    },
    dealAnalysis: {
      sellBasis: analysis.sellBasis,
      valuation: analysis.valuation,
      costs: {
        repair: analysis.repairCost,
        transport: analysis.transportCost,
        selling: analysis.sellingCost,
      },
      warnings: analysis.warnings,
      prediction: analysis.prediction,
    },
  };
  return {
    ...mapped,
    trustExplanation: buildTrustExplanation(mapped, {}, desk),
  };
}

async function publicPreviewFallback(args: {
  includeRepairable?: string | null;
  lane: string;
  q: string;
  state: string;
  source: string;
  maxPrice: number;
  minPrice: number;
  page: number;
  pageSize: number;
  sellerType?: string;
  desk: DiscoverDesk;
  /** Signed out: seller identity is stripped too. Defaults to guest (fail closed). */
  signedIn?: boolean;
}) {
  const flipDesk = args.desk === "flip";
  const deskAccess = deskAccessFor(args.desk);
  const plan = planScrapeForBuyerScope({
    lane: args.lane || "all",
    q: args.q,
    state: args.state || "Nationwide",
  });
  const sources = [
    { id: "copart", fetchRows: () => previewCopartLots(36) },
    { id: "govdeals", fetchRows: () => previewGovDeals(1) },
    { id: "publicsurplus", fetchRows: () => previewPublicSurplus(1) },
    { id: "municibid", fetchRows: () => previewMunicibid(1) },
  ].filter((source) => {
    // Public, unauthenticated route: never live-fetch a source whose terms ban automated access
    // (Copart, PublicSurplus, ...) unless the operator opted in through SCRAPE_SOURCES.
    if (!isAutomationAllowedSource(source.id)) return false;
    if (
      !wantsAuctionInventory({
        lane: args.lane,
        sellerType: args.sellerType,
        sources: [args.source],
      })
    )
      return false;
    if (!plan.sourceIds.includes(source.id)) return false;
    if (args.source && args.source !== "all") return source.id === args.source;
    return true;
  });

  if (sources.length === 0) {
    return {
      configured: false,
      vehicles: [],
      deskAccess,
      total: 0,
      state: args.state || "nationwide",
      page: args.page,
      pageSize: args.pageSize,
      hasMore: false,
      isLive: false,
      isLivePreview: false,
      isLocalPreviewCache: false,
      previewProof: [
        {
          id:
            args.source && args.source !== "all"
              ? args.source
              : args.lane || "all",
          status: "no_rows",
          rows: 0,
          matchedRows: 0,
          detail:
            "No no-login public preview source is available for this lane/source combination.",
        },
      ],
      message:
        "No no-login public preview source is available for this lane/source combination.",
    };
  }

  const proof: any[] = [];
  const rows: any[] = [];
  for (const source of sources) {
    try {
      const raw = await source.fetchRows();
      const tagged = raw.map((row) => ({ ...row, source: source.id }));
      const matched = tagged.filter((row) =>
        matchesPublicScope(row, {
          q: args.q,
          state: args.state,
          maxPrice: args.maxPrice,
          minPrice: args.minPrice,
          source: args.source,
        }),
      );
      proof.push({
        id: source.id,
        status: matched.length ? "working" : "no_rows",
        rows: raw.length,
        matchedRows: matched.length,
      });
      rows.push(
        ...matched.map((row) => publicRowToVehicle(row, source.id, args.desk)),
      );
    } catch (error) {
      console.warn(`scan preview ${source.id} failed:`, error);
      proof.push({
        id: source.id,
        status: "blocked",
        rows: 0,
        matchedRows: 0,
        detail: "Source did not respond to the preview request.",
      });
    }
  }

  const unique = Array.from(
    new Map(rows.map((row) => [dedupeKey(row), row])).values(),
  );
  const cache = new LocalScraperCache({ cacheOnly: true });
  if (unique.length > 0) {
    await cache.load();
    await cache.rememberOnly(
      "scan-preview",
      unique.map((vehicle) => ({
        id: `${vehicle.source}|${vehicle.id}`,
        value: vehicle,
      })),
    );
  }
  const cachedRows =
    unique.length > 0
      ? []
      : ((await cache.records("scan-preview")) as any[]).filter((vehicle) =>
          matchesVehicleScope(vehicle, {
            q: args.q,
            state: args.state,
            maxPrice: args.maxPrice,
            minPrice: args.minPrice,
            source: args.source,
            allowedSources: plan.sourceIds,
          }),
        );
  const effectiveRows = (unique.length > 0 ? unique : cachedRows).filter(
    (row) =>
      args.includeRepairable !== "0" ||
      !hasReportedRepairRisk(row.condition, row.damageType ?? row.damage_type),
  );
  const start = args.page * args.pageSize;
  const pageRows = effectiveRows.slice(start, start + args.pageSize);
  // Same desk gate as the live path — preview rows include analyzeDeal profit/max-bid. Rebuild the
  // trust copy after redaction so it cannot quote stripped economics (cached rows may predate it).
  const filters: ScanMatchFilters = {
    q: args.q,
    lane: args.lane,
    state: args.state,
    source: args.source,
    minPrice: args.minPrice,
    maxPrice: args.maxPrice,
    sellerType: args.sellerType,
  };
  const deskVehicles = flipDesk
    ? pageRows
    : pageRows.map((row) => {
        const redacted = redactListingForNonFlipDesk(row);
        return {
          ...redacted,
          trustExplanation: buildTrustExplanation(redacted, filters, args.desk),
        };
      });
  const vehicles = args.signedIn
    ? deskVehicles
    : deskVehicles.map((v) => redactSellerForGuest(v));
  return {
    configured: false,
    vehicles,
    deskAccess,
    total: effectiveRows.length,
    state: args.state || "nationwide",
    page: args.page,
    pageSize: args.pageSize,
    hasMore: effectiveRows.length > start + args.pageSize,
    isLive: false,
    isLivePreview: unique.length > 0,
    isLocalPreviewCache: unique.length === 0 && cachedRows.length > 0,
    previewProof: proof,
    message: unique.length
      ? "Showing real public preview rows because Supabase is not configured. These rows are not saved yet."
      : cachedRows.length
        ? "Showing locally cached public preview rows because no live rows matched right now."
        : "Supabase is not configured and no public preview rows matched this scope.",
  };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "scan", limit: 90, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl) as any;

  const { searchParams } = new URL(req.url);
  // "honda civic under 15000" → make/model/maxPrice instead of a literal title match (Kera bug).
  expandFreeTextQuery(searchParams);
  const rangeError = validateInventoryRanges(searchParams);
  if (rangeError)
    return NextResponse.json({ error: rangeError }, { status: 400 });
  // Sanitize free-text search before it's interpolated into the PostgREST .or() filter — strip
  // anything that isn't a normal vehicle/VIN character so commas/parens can't inject extra filters.
  const q = (searchParams.get("q") || "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const state = searchParams.get("state") || "";
  // Multi-state hard filter (for the "deals near you" widget: your state + surrounding states).
  const states = (searchParams.get("states") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const make = searchParams.get("make") || "";
  const makes = (searchParams.get("makes") || "")
    .split(",")
    .map((s) =>
      s
        .replace(/[^a-zA-Z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 12);
  const model = searchParams.get("model") || "";
  const source = searchParams.get("source") || "";
  // Per-dealer inventory filter (site host). Host-safe chars only.
  const dealer = (searchParams.get("dealer") || "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "");
  // Multi-dealer filter (comma-separated hosts) — powers the "new from watched dealers" feed.
  const dealers = (searchParams.get("dealers") || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.replace(/[^a-z0-9.-]/g, ""))
    .filter(Boolean)
    .slice(0, 25);
  const dealerSourceIds = (searchParams.get("dealerSourceIds") || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.replace(/[^a-z0-9_-]/g, ""))
    .filter(Boolean)
    .slice(0, 25);
  const titleType = searchParams.get("titleType") || "";
  const lane = (searchParams.get("lane") || "").toLowerCase();
  const sellerType = (searchParams.get("sellerType") || "").toLowerCase();
  const category = searchParams.get("cat") || "";
  const minProfit = parseInt(searchParams.get("minProfit") || "0");
  // Range filters — remove the "borders" so any buyer can scope by era, budget, and odometer.
  const minYear = parseInt(searchParams.get("minYear") || "0");
  const maxYear = parseInt(searchParams.get("maxYear") || "0");
  const maxPrice = parseInt(searchParams.get("maxPrice") || "0");
  const minPrice = parseInt(searchParams.get("minPrice") || "0");
  const verdict = searchParams.get("verdict") || "";
  const availability = searchParams.get("availability") || "";
  const madeInUsa = searchParams.get("madeInUsa") === "1";
  // Resolve the caller's SAVED desk before building the query: sort, profit floors and verdict
  // filters all read flip-only columns, so they are flip-desk only (fail closed to personal).
  const { desk, signedIn } = await resolveCallerAccess();
  const flipDesk = desk === "flip";
  const deskAccess = deskAccessFor(desk);
  const requestedSort = normalizeScanSort(searchParams.get("sort"));
  const sort = scanSortForDesk(requestedSort, flipDesk);
  const page = Math.min(
    1000000,
    Math.max(0, Math.floor(Number(searchParams.get("page")) || 0)),
  );
  // Bigger page + client-driven infinite scroll (append) so the grid surfaces ALL matching inventory,
  // not just the first screen. Capped to keep any single payload reasonable.
  const pageSize = normalizePageSize(searchParams.get("pageSize"));

  if (!isSupabaseConfigured()) {
    if (SCAN_EXTRA_KEYS.some((key) => searchParams.get(key)))
      return NextResponse.json(
        { error: "Detailed source inventory is temporarily unavailable" },
        { status: 503, headers: SCAN_CACHE_HEADERS },
      );
    const preview = await publicPreviewFallback({
      includeRepairable: searchParams.get("includeRepairable"),
      lane,
      sellerType,
      q,
      state,
      source: source.toLowerCase(),
      maxPrice,
      minPrice,
      page,
      pageSize,
      desk,
      signedIn,
    });
    return NextResponse.json(preview, { headers: SCAN_CACHE_HEADERS });
  }

  const supabase = db();

  let query = supabase
    .from("deals")
    .select(SCAN_SELECT, { count: "exact" })
    // Only live inventory — the nightly prune sets active=false on deals unseen >30 days (awaiting
    // hard-delete at 60). discover/deals-service already filter this; scan was leaking stale rows.
    .eq("active", true);

  query = applyLiveAuctionWindow(query);

  if (
    !hasAuctionDetailFilters(searchParams) &&
    !wantsAuctionInventory({
      lane,
      sellerType,
      sources: [source, category, ...dealerSourceIds],
    })
  ) {
    query = query.not("source", "in", `(${AUCTION_DB_SOURCES.join(",")})`);
  }

  if (make) {
    query = query.ilike("make", make);
  }
  if (makes.length) {
    query = query.in("make", makes);
  }

  if (model) {
    query = query.ilike("model", model);
  }

  if (states.length) {
    query = query.in("location_state", states);
  } else if (
    state &&
    state.toLowerCase() !== "all" &&
    state.toLowerCase() !== "nationwide"
  ) {
    query = query.eq("location_state", state.toUpperCase());
  }

  // Guest-friendly ZIP + radius ("within 50 mi of 60601"). Cache-first geocode, then a lat/lng box in
  // SQL and an exact straight-line check per row below. Rows without coordinates can't be placed.
  const zipRadius = await resolveZipRadius(supabase, searchParams);
  if (zipRadius) query = applyZipRadiusBox(query, zipRadius);

  if (availability && availability !== "all") {
    query = query.eq("availability_status", availability);
  }

  if (madeInUsa) {
    // NHTSA returns assembly country like "UNITED STATES (USA)".
    query = query.or(
      "assembly_country.ilike.%united states%,assembly_country.ilike.%usa%",
    );
  }

  if (q && !hasVehicleCategoryQuery(q)) {
    query = query.or(
      `title.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%,vin.ilike.%${q}%`,
    );
  }

  // deal_verdict and true_net_profit are flip economics. Filtering on them off the flip desk would
  // leak them through which rows come back, so non-flip callers ignore these params.
  if (flipDesk && verdict && verdict !== "all") {
    if (isWatchCandidateVerdict(verdict)) {
      query = query
        .gte("ask_price", 3000)
        .gt("sell_estimate", 0)
        .not("true_net_profit", "is", null)
        .lt("true_net_profit", 0);
    } else {
      query = query.eq("deal_verdict", verdict);
    }
  }
  if (minYear > 0) query = query.gte("year", minYear);
  if (maxYear > 0) query = query.lte("year", maxYear);
  query = applyVehicleDetails(query, searchParams);

  if (source && source.toLowerCase() !== "all") {
    const sourceValues = uniqueDbSources([source]);
    query =
      sourceValues.length === 1
        ? query.eq("source", sourceValues[0])
        : query.in("source", sourceValues);
    query = applySourceUrlNeedles(query, source);
  }
  // Filter to a single curated dealer by its site host (source_url contains it) — powers the per-dealer
  // in-app inventory view. Sanitized to host-safe chars before interpolation.
  if (dealer) {
    query = query.ilike("source_url", `%${dealer}%`);
  }
  if (dealers.length) {
    query = query.or(dealers.map((h) => `source_url.ilike.%${h}%`).join(","));
  }
  if (dealerSourceIds.length) {
    const sourceValues = uniqueDbSources(dealerSourceIds);
    if (sourceValues.length) {
      query =
        sourceValues.length === 1
          ? query.eq("source", sourceValues[0])
          : query.in("source", sourceValues);
    }
    const needleFilter = sourceUrlNeedleFilter(dealerSourceIds);
    if (needleFilter) query = query.or(needleFilter);
  }

  if (sellerType && sellerType !== "all") {
    const sellerSources = sellerTypeSourceValues(sellerType);
    if (sellerSources.length) query = query.in("source", sellerSources);
  }

  // titleType=clean|rebuilt|salvage|rebuildable|unknown (comma-multi) on the condition enum.
  const titleFilter = titleCategoryOrFilter(parseTitleTypes(titleType));
  if (titleFilter) query = query.or(titleFilter);

  query = applyInventoryLane(query, lane);
  query = applyRepairEligibility(query, searchParams.get("includeRepairable"));

  if (category && !source && !titleType) {
    const cleanCat = category.toLowerCase();
    if (
      ["copart", "iaa", "craigslist", "ebay", "facebook"].includes(cleanCat)
    ) {
      const sourceMapping: Record<string, string> = {
        facebook: "facebook_marketplace",
        ebay: "ebay_motors",
      };
      query = query.eq("source", sourceMapping[cleanCat] || cleanCat);
    } else {
      query = query.eq("condition", cleanCat);
    }
  }

  if (flipDesk && minProfit > 0) {
    query = query.gte("true_net_profit", minProfit);
  }

  const sortOrder = scanSortOrder(sort);
  const trustRanked = sort === "score";
  // Page in the database so trust sorting cannot strand inventory beyond a fixed pool.
  const from = page * pageSize;
  const to = (page + 1) * pageSize - 1;
  query = query
    .order(sortOrder.column, {
      ascending: sortOrder.ascending,
      nullsFirst: sortOrder.nullsFirst,
    })
    .order("id", { ascending: true });

  let categoryIds: string[] | null = null;
  if (hasVehicleCategoryQuery(q)) {
    const scopeKey = new URLSearchParams(searchParams);
    scopeKey.delete("page");
    scopeKey.delete("pageSize");
    scopeKey.sort();
    try {
      categoryIds = await cached(
        `scan-category:${desk}:${scopeKey}`,
        15000,
        () =>
          matchingCategoryIds(
            (start, end) => query.select(CATEGORY_PROJECTION).range(start, end),
            q,
          ),
      );
    } catch (categoryError) {
      return internalError("scan:category", categoryError);
    }
    const pageIds = categoryIds.slice(from, to + 1);
    if (!pageIds.length)
      return NextResponse.json(
        {
          vehicles: [],
          deskAccess,
          total: categoryIds.length,
          state: states.join(",") || state || "nationwide",
          page,
          pageSize,
          hasMore: false,
          isLive: true,
          sort,
        },
        { headers: SCAN_CACHE_HEADERS },
      );
    query = query
      .select(SCAN_SELECT)
      .in("id", pageIds)
      .range(0, pageSize - 1);
  } else {
    query = query.range(from, to);
  }
  const { data, count: dbCount, error } = await query;
  const count = categoryIds ? categoryIds.length : dbCount;
  if (error) {
    console.error("API scan error:", error.message);
    return internalError("scan", error);
  }

  const scanFilters: ScanMatchFilters = {
    q,
    lane,
    state,
    states,
    make,
    makes,
    model,
    titleType,
    sellerType,
    minPrice,
    maxPrice,
    source,
    dealer,
    dealers,
    dealerSourceIds,
  };
  const inRadius = zipRadius
    ? (data || []).filter((r: any) => {
        const mi = milesFrom(zipRadius, r);
        return mi != null && mi <= zipRadius.radius;
      })
    : data || [];
  const dRows = inRadius.map((r: any) => {
    const normalized = {
      ...normalizeRow(r, "deals"),
      // Distance only; exact coordinates never leave the server.
      ...(zipRadius
        ? { distanceMiles: milesFrom(zipRadius, r) ?? undefined }
        : {}),
    };
    return {
      ...normalized,
      trustExplanation: buildTrustExplanation(normalized, scanFilters, desk),
    };
  });
  const ranked =
    trustRanked || state
      ? sortScanRows(dRows, sort, state, { includeProfit: flipDesk })
      : dRows;
  const sorted = ranked;

  // Profit, max bid, and seller contact only go to a saved reseller / dealer desk.
  // Rebuild trustExplanation AFTER redaction so reason strings cannot quote stripped fields
  // (e.g. "$2,500 estimated spread" / "recommended max buy").
  const deskVehicles = flipDesk
    ? sorted
    : sorted.map((row) => {
        const redacted = redactListingForNonFlipDesk(row);
        return {
          ...redacted,
          trustExplanation: buildTrustExplanation(redacted, scanFilters, desk),
        };
      });
  // Signed out: no seller names either (often a private person on CL / FB).
  const vehicles = signedIn
    ? deskVehicles
    : deskVehicles.map((v) => redactSellerForGuest(v));
  return NextResponse.json(
    {
      vehicles,
      deskAccess,
      total: count || 0,
      state: states.join(",") || state || "nationwide",
      page,
      pageSize,
      hasMore: (count || 0) > (page + 1) * pageSize,
      isLive: true,
      sort,
    },
    { headers: SCAN_CACHE_HEADERS },
  );
}

// POST — trigger a new scan
// The legacy BullMQ "scrape" queue has been removed; scraping is now handled by the
// GitHub Actions ingestion pipeline (or by the AI parsing queue when a user saves a
// specific URL). This endpoint remains so the UI can signal a refresh, but the actual
// live results come from the deals table via the GET endpoint above.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const searchTerm = body.searchTerm || body.q;
    const plan = planScrapeForBuyerScope(body.scope || body);

    if (!searchTerm) {
      return NextResponse.json(
        { error: "searchTerm or q is required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
      message: `Smart scan planned for "${searchTerm}". It is limited to ${plan.sourceIds.length} relevant source${plan.sourceIds.length === 1 ? "" : "s"} instead of the whole catalog.`,
    });
  } catch (error: any) {
    console.error("Scan trigger error:", error);
    return internalError("scan", error);
  }
}
import { applyLiveAuctionWindow } from "@/lib/search/live-auction-window";
