import { NextRequest, NextResponse } from "next/server";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";
import { previewPublicSurplus } from "@/lib/scrapers/sources/publicsurplus";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { gradeDataQuality } from "@/lib/data-quality";
import { sellerContact } from "@/lib/data/deal-contact";

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
    maxMileage: number;
  },
) {
  const price = Number(row.ask_price || row.askPrice || 0);
  const year = Number(row.year || 0);
  const mileage = Number(row.mileage || 0);
  if (scope.minPrice && (!price || price < scope.minPrice)) return false;
  if (scope.maxPrice && (!price || price > scope.maxPrice)) return false;
  if (scope.minYear && (!year || year < scope.minYear)) return false;
  if (scope.maxMileage && mileage && mileage > scope.maxMileage) return false;
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
    profitEstimate: 0,
    profitScore: 50,
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lane = searchParams.get("lane") || "damaged";
    const q = cleanText(searchParams.get("q"));
    const state = (searchParams.get("state") || "").toUpperCase();
    const titleType = cleanText(searchParams.get("titleType"));
    const maxPrice = cleanNumber(searchParams.get("maxPrice"));
    const minPrice = cleanNumber(searchParams.get("minPrice"));
    const minYear = cleanNumber(searchParams.get("minYear"));
    const maxMileage = cleanNumber(searchParams.get("maxMileage"));
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

    let candidates = PREVIEW_SOURCES.filter(
      (source) =>
        sourceMatchesPlan(source, plan.sourceIds) &&
        sourceMatchesSellerType(source, sellerType),
    );
    if (requestedSource && requestedSource !== "all") {
      const exact = PREVIEW_SOURCES.find((source) =>
        source.sourceIds.some((id) => cleanSource(id) === requestedSource),
      );
      candidates =
        exact &&
        sourceMatchesPlan(exact, plan.sourceIds) &&
        sourceMatchesSellerType(exact, sellerType)
          ? [exact, ...candidates.filter((source) => source.id !== exact.id)]
          : [];
    }

    if (!candidates.length) {
      return NextResponse.json({
        ok: true,
        isLivePreview: true,
        plan,
        vehicles: [],
        total: 0,
        message: requestedSource
          ? "This source does not have a public no-auth preview path yet. Connect Supabase and run an authorized import for this source."
          : sellerType && sellerType !== "all"
            ? "No public no-auth preview source matches this seller type yet. Use live Scan rows or run an authorized import."
            : "No public no-auth preview source is available for this scope yet.",
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
        const lots = await candidate.fetchRows();
        const tagged = lots.map((row: any) => ({
          ...row,
          source: candidate.id,
        }));
        const filtered = tagged.filter((row: any) => {
          if (state && state !== "ALL" && row.location_state !== state)
            return false;
          if (!matchesQuery(row, q)) return false;
          if (!matchesTitleType(row, titleType)) return false;
          return matchesNumericScope(row, {
            minPrice,
            maxPrice,
            minYear,
            maxMileage,
          });
        });
        const vehicles = filtered
          .slice(0, 24)
          .map((row) => rowToVehicle(row, candidate.id));

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
          return NextResponse.json({
            ok: true,
            isLivePreview: true,
            previewSource: candidate.id,
            attemptedSources: candidates.map((source) => source.id),
            proof,
            plan,
            vehicles,
            total: vehicles.length,
            message: `Showing a real public ${candidate.label} preview. These rows are not saved until Supabase is configured.`,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed";
        proof.push({
          id: candidate.id,
          label: candidate.label,
          status: "blocked",
          rows: 0,
          matchedRows: 0,
          detail: message,
        });
      }
    }

    return NextResponse.json({
      ok: false,
      isLivePreview: true,
      attemptedSources: candidates.map((source) => source.id),
      proof,
      plan,
      vehicles: [],
      total: 0,
      message:
        "Public preview sources responded with no matching rows or were temporarily unreachable. Broaden the scope or connect Supabase and run imports.",
      detail: proof.map((item) => `${item.label}: ${item.detail}`).join("; "),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live preview failed.";
    return NextResponse.json(
      {
        ok: false,
        isLivePreview: true,
        vehicles: [],
        total: 0,
        message:
          "The public live preview source is temporarily unreachable from this network. Try again or connect Supabase and run imports.",
        detail: message,
      },
      { status: 200 },
    );
  }
}
