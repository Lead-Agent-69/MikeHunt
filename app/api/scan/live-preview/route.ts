import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { cached } from "@/lib/cache";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";
import { previewPublicSurplus } from "@/lib/scrapers/sources/publicsurplus";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { gradeDataQuality } from "@/lib/data-quality";
import { sellerContact } from "@/lib/data/deal-contact";
import {
  redactListingForNonFlipDesk,
  resolveCallerDesk,
} from "@/lib/deals/deal-desk-access";
import { isAutomationAllowedSource } from "@/lib/scrapers/sweep-schedule";
import {
  previewFilterMessage,
  unsupportedPreviewFilters,
} from "@/lib/search/preview-filter-support";

export const dynamic = "force-dynamic";

function cleanText(value: string | null) {
  return (value || "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanSource(value: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanNumber(value: string | null) {
  const n = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function queryTokens(q: string) {
  const words = q.split(/\s+/).filter(Boolean);
  const aliases: Record<string, string[]> = {
    suvs: ["suv", "sport utility", "utility"],
    suv: ["suv", "sport utility", "utility"],
    trucks: ["truck", "pickup"],
    truck: ["truck", "pickup"],
    vans: ["van", "cargo"],
    van: ["van", "cargo"],
    sedans: ["sedan", "4dr", "four door"],
    sedan: ["sedan", "4dr", "four door"],
    "hybrid ev": ["hybrid", "electric", "ev"],
  };
  const joined = q.trim();
  return Array.from(
    new Set([...(aliases[joined] || []), ...words, joined].filter(Boolean)),
  );
}

function matchesQuery(row: any, q: string) {
  if (!q) return true;
  const haystack =
    `${row.title || ""} ${row.make || ""} ${row.model || ""}`.toLowerCase();
  return queryTokens(q).some((token) => haystack.includes(token));
}

function rowTitleType(row: any) {
  return String(
    row.title_type ||
      row.titleType ||
      row.title_status ||
      row.titleStatus ||
      row.condition ||
      row.title ||
      "",
  ).toLowerCase();
}

function matchesTitleType(row: any, titleType: string) {
  if (!titleType || titleType === "all") return true;
  const haystack = rowTitleType(row);
  if (titleType === "clean") return /clean/.test(haystack);
  if (titleType === "salvage")
    return /salvage|repairable|damage/.test(haystack);
  if (titleType === "rebuilt") return /rebuilt|reconstructed/.test(haystack);
  return haystack.includes(titleType);
}

function matchesNumericScope(
  row: any,
  scope: {
    minPrice: number;
    maxPrice: number;
    minYear: number;
    maxYear: number;
    minMileage: number;
    maxMileage: number;
  },
) {
  const price = Number(row.ask_price || row.askPrice || 0);
  const year = Number(row.year || 0);
  const mileage =
    row.mileage != null && row.mileage !== "" ? Number(row.mileage) : null;
  if (scope.minPrice && (!price || price < scope.minPrice)) return false;
  if (scope.maxPrice && (!price || price > scope.maxPrice)) return false;
  if (scope.minYear && (!year || year < scope.minYear)) return false;
  if (scope.maxYear && (!year || year > scope.maxYear)) return false;
  if (
    scope.minMileage &&
    (mileage == null || !Number.isFinite(mileage) || mileage < scope.minMileage)
  )
    return false;
  if (
    scope.maxMileage &&
    (mileage == null || !Number.isFinite(mileage) || mileage > scope.maxMileage)
  )
    return false;
  return true;
}

function rowToVehicle(row: any, sourceId?: string) {
  const canonicalSource = sourceId || row.source;
  const contact = sellerContact(row);
  const quality = gradeDataQuality({
    images: row.images,
    vin: row.vin,
    titleType:
      row.title_type ||
      row.titleType ||
      row.title_status ||
      row.titleStatus ||
      String(row.title || row.condition || "").match(
        /salvage|rebuilt|clean title|parts/i,
      )?.[0] ||
      null,
    condition: row.condition,
    damageType: row.damage_type,
    mileage: row.mileage,
    locationCity: row.location_city,
    locationState: row.location_state,
    askPrice: row.ask_price,
    seller: row.seller,
    sellerType: row.seller_type,
    sellerPhone: contact.phone,
    sellerEmail: contact.email,
    sellerContactUrl: contact.url,
    auctionEndAt: row.auction_end || row.auction_end_at || row.auctionEndAt,
    sourceUrl: row.source_url,
  });

  return {
    id: `live-${canonicalSource}-${row.source_deal_id}`,
    source: canonicalSource,
    title: row.title,
    year: row.year,
    make: row.make,
    model: row.model,
    vin: row.vin,
    mileage: row.mileage,
    condition: row.condition,
    damageType: row.damage_type,
    askPrice: row.ask_price,
    mmrValue: row.metadata?.acv_estimate || 0,
    // No profit model runs on preview rows. Leave profit unset instead of a fake $0 / score 50.
    images: row.images || [],
    locationCity: row.location_city,
    locationState: row.location_state,
    sourceUrl: row.source_url,
    seller: row.seller,
    sellerType: row.seller_type,
    sellerPhone: contact.phone,
    sellerEmail: contact.email,
    sellerContactUrl: contact.url,
    auctionEndAt: row.auction_end || row.auction_end_at || row.auctionEndAt,
    bidCount: row.bid_count,
    firstSeenAt: row.scraped_at || new Date().toISOString(),
    lastSeenAt: row.scraped_at || new Date().toISOString(),
    dataQuality: {
      score: quality.score,
      label: quality.label,
      missing: quality.missing,
    },
  };
}

type PreviewSource = {
  id: string;
  label: string;
  sourceIds: string[];
  fetchRows: () => Promise<Partial<any>[]>;
};

const PREVIEW_SOURCES: PreviewSource[] = [
  {
    id: "copart",
    label: "Copart",
    sourceIds: ["copart"],
    fetchRows: () => previewCopartLots(36),
  },
  {
    id: "govdeals",
    label: "GovDeals",
    sourceIds: ["govdeals"],
    fetchRows: () => previewGovDeals(1),
  },
  {
    id: "publicsurplus",
    label: "PublicSurplus",
    sourceIds: ["publicsurplus"],
    fetchRows: () => previewPublicSurplus(1),
  },
  {
    id: "municibid",
    label: "Municibid",
    sourceIds: ["municibid"],
    fetchRows: () => previewMunicibid(1),
  },
];

function sourceMatchesPlan(source: PreviewSource, sourceIds: string[]) {
  return source.sourceIds.some((id) => sourceIds.includes(id));
}

function sourceMatchesSellerType(source: PreviewSource, sellerType: string) {
  if (!sellerType || sellerType === "all") return true;
  const auctionSources = new Set([
    "copart",
    "govdeals",
    "publicsurplus",
    "municibid",
  ]);
  if (sellerType === "auction") {
    return source.sourceIds.some((id) => auctionSources.has(id));
  }
  return false;
}

// Public and unauthenticated, and every candidate is a live upstream fetch from our IP. Cache each
// source's preview rows briefly and rate-limit per client so the route can't be used to hammer
// Copart / GovDeals / PublicSurplus / Municibid (or burn our IP reputation).
const PREVIEW_CACHE_MS = 5 * 60_000;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "scan-live-preview",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  // Seller contact is flip-desk only, same as /api/scan. Fail closed to personal.
  const desk = await resolveCallerDesk();
  const flipDesk = desk === "flip";
  const deskAccess = flipDesk ? "flip" : "personal";
  const json = (body: Record<string, unknown>) =>
    NextResponse.json({ ...body, deskAccess }, { headers: NO_STORE });
  try {
    const { searchParams } = new URL(req.url);
    const unsupported = unsupportedPreviewFilters(searchParams);
    if (unsupported.length)
      return json({
        ok: false,
        isLivePreview: true,
        vehicles: [],
        total: 0,
        unsupportedFilters: unsupported,
        message: previewFilterMessage,
      });
    const lane = searchParams.get("lane") || "damaged";
    const q = cleanText(searchParams.get("q"));
    const state = (searchParams.get("state") || "").toUpperCase();
    const titleType = cleanText(searchParams.get("titleType"));
    const maxPrice = cleanNumber(searchParams.get("maxPrice"));
    const minPrice = cleanNumber(searchParams.get("minPrice"));
    const minYear = cleanNumber(searchParams.get("minYear"));
    const maxYear = cleanNumber(searchParams.get("maxYear"));
    const minMileage = cleanNumber(searchParams.get("minMileage"));
    const maxMileage = cleanNumber(searchParams.get("maxMileage"));
    const make = cleanText(searchParams.get("make"));
    const makes = (searchParams.get("makes") || "")
      .split(",")
      .map((value) => cleanText(value))
      .filter(Boolean);
    const model = cleanText(searchParams.get("model"));
    const requestedSource = cleanSource(searchParams.get("source"));
    const sellerType = cleanText(searchParams.get("sellerType"));
    const plan = planScrapeForBuyerScope({
      lane,
      q,
      state,
      titleType,
      maxPrice: maxPrice || undefined,
      minYear: minYear || undefined,
      maxMileage: maxMileage || undefined,
    });

    // Never live-fetch a terms-restricted source (Copart, PublicSurplus, ...) from this public route
    // unless the operator opted in through SCRAPE_SOURCES.
    const allowedSources = PREVIEW_SOURCES.filter((source) =>
      source.sourceIds.every((id) => isAutomationAllowedSource(id)),
    );
    let candidates = allowedSources.filter(
      (source) =>
        sourceMatchesPlan(source, plan.sourceIds) &&
        sourceMatchesSellerType(source, sellerType),
    );
    if (requestedSource && requestedSource !== "all") {
      const exact = allowedSources.find((source) =>
        source.sourceIds.some((id) => cleanSource(id) === requestedSource),
      );
      candidates =
        exact &&
        sourceMatchesPlan(exact, plan.sourceIds) &&
        sourceMatchesSellerType(exact, sellerType)
          ? [exact]
          : [];
    }

    if (!candidates.length) {
      return json({
        ok: true,
        isLivePreview: true,
        plan,
        vehicles: [],
        total: 0,
        message: requestedSource
          ? "This source isn't available for preview in this search. Choose another source or adjust your filters."
          : sellerType && sellerType !== "all"
            ? "No available preview source matches this seller type. Browse existing vehicles or try another source."
            : "No available preview source matches this search. Browse existing vehicles or adjust your filters.",
      });
    }

    const proof: {
      id: string;
      label: string;
      status: "working" | "no_rows" | "blocked";
      rows: number;
      matchedRows: number;
      detail?: string;
    }[] = [];
    for (const candidate of candidates) {
      try {
        const lots = await cached(
          `scan:live-preview:${candidate.id}`,
          PREVIEW_CACHE_MS,
          candidate.fetchRows,
          (rows) => Array.isArray(rows) && rows.length > 0,
        );
        const tagged = lots.map((row: any) => ({
          ...row,
          source: candidate.id,
        }));
        const filtered = tagged.filter((row: any) => {
          if (state && state !== "ALL" && row.location_state !== state)
            return false;
          if (!matchesQuery(row, q)) return false;
          if (!matchesTitleType(row, titleType)) return false;
          if (make && make !== "all" && cleanText(row.make) !== make)
            return false;
          if (makes.length && !makes.includes(cleanText(row.make)))
            return false;
          if (model && model !== "all" && cleanText(row.model) !== model)
            return false;
          return matchesNumericScope(row, {
            minPrice,
            maxPrice,
            minYear,
            maxYear,
            minMileage,
            maxMileage,
          });
        });
        const vehicles = filtered
          .slice(0, 24)
          .map((row) => rowToVehicle(row, candidate.id))
          .map((vehicle) =>
            flipDesk ? vehicle : redactListingForNonFlipDesk(vehicle),
          );

        proof.push({
          id: candidate.id,
          label: candidate.label,
          status: vehicles.length ? "working" : "no_rows",
          rows: lots.length,
          matchedRows: filtered.length,
          detail: vehicles.length
            ? `${filtered.length} rows matched this scope.`
            : "Responded, but no rows matched this scope.",
        });

        if (vehicles.length) {
          return json({
            ok: true,
            isLivePreview: true,
            previewSource: candidate.id,
            attemptedSources: proof.map((source) => source.id),
            proof,
            plan,
            vehicles,
            total: vehicles.length,
            message: `Preview vehicles from ${candidate.label}. Confirm current details on the source listing before deciding.`,
          });
        }
      } catch (error) {
        // Log the upstream error; the client only learns that this source did not answer.
        console.warn(`scan live-preview ${candidate.id} failed:`, error);
        proof.push({
          id: candidate.id,
          label: candidate.label,
          status: "blocked",
          rows: 0,
          matchedRows: 0,
          detail: "Source did not respond to the preview request.",
        });
      }
    }

    return json({
      ok: false,
      isLivePreview: true,
      attemptedSources: candidates.map((source) => source.id),
      proof,
      plan,
      vehicles: [],
      total: 0,
      message:
        "No matching preview vehicles were returned, or a selected source couldn't be reached. Existing vehicles remain available; adjust your filters or try again later.",
      detail: proof.map((item) => `${item.label}: ${item.detail}`).join("; "),
    });
  } catch (error) {
    console.error("scan live-preview error:", error);
    return json({
      ok: false,
      isLivePreview: true,
      vehicles: [],
      total: 0,
      message:
        "The public live preview source is temporarily unreachable from this network. Try again or connect Supabase and run imports.",
    });
  }
}
