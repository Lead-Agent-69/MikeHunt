import { NextRequest, NextResponse } from "next/server";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";
import { previewPublicSurplus } from "@/lib/scrapers/sources/publicsurplus";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { gradeDataQuality } from "@/lib/data-quality";

export const dynamic = "force-dynamic";

function cleanText(value: string | null) {
  return (value || "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function rowToVehicle(row: any) {
  const quality = gradeDataQuality({
    images: row.images,
    vin: row.vin,
    condition: row.condition,
    damageType: row.damage_type,
    mileage: row.mileage,
    locationCity: row.location_city,
    locationState: row.location_state,
    askPrice: row.ask_price,
    seller: row.seller,
    sellerType: row.seller_type,
    sourceUrl: row.source_url,
  });

  return {
    id: `live-${row.source}-${row.source_deal_id}`,
    source: row.source,
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

function sourceMatchesPlan(
  source: PreviewSource,
  sourceIds: string[],
  lane: string,
) {
  if (source.sourceIds.some((id) => sourceIds.includes(id))) return true;
  // Damaged/all shoppers still benefit from a no-auth government fallback when Copart is unreachable.
  return (
    ["all", "damaged", "auction", "government"].includes(lane) &&
    source.id !== "copart"
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lane = searchParams.get("lane") || "damaged";
    const q = cleanText(searchParams.get("q"));
    const state = (searchParams.get("state") || "").toUpperCase();
    const plan = planScrapeForBuyerScope({ lane, q, state });

    const candidates = PREVIEW_SOURCES.filter((source) =>
      sourceMatchesPlan(source, plan.sourceIds, lane),
    );

    if (!candidates.length) {
      return NextResponse.json({
        ok: true,
        isLivePreview: true,
        plan,
        vehicles: [],
        total: 0,
        message:
          "No public no-auth preview source is available for this scope yet.",
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
        const filtered = lots.filter((row: any) => {
          if (state && state !== "ALL" && row.location_state !== state)
            return false;
          return matchesQuery(row, q);
        });
        const vehicles = filtered.slice(0, 24).map(rowToVehicle);

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
