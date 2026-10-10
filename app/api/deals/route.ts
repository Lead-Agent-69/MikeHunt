export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { DealsService, DealFilters } from "@/lib/data/deals-service";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  listingsForDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";

// Desk-scoped payload: flip economics and seller contact only for a saved reseller / dealer desk.
const DEALS_HEADERS = { "Cache-Control": "private, no-store" };

/** Non-flip callers cannot filter or sort by flip economics (that would leak them by probing). */
export function filtersForDesk(
  filters: DealFilters,
  flipDesk: boolean,
): DealFilters {
  if (flipDesk) return filters;
  const sortBy =
    filters.sortBy === "profitEstimate" || filters.sortBy === "profitScore"
      ? "lastSeenAt"
      : filters.sortBy || "lastSeenAt";
  return { ...filters, minProfit: undefined, minScore: undefined, sortBy };
}

function deskResult<T extends { deals?: any[] }>(result: T, flipDesk: boolean) {
  return NextResponse.json(
    {
      ...result,
      deals: listingsForDesk(result.deals || [], flipDesk),
      deskAccess: flipDesk ? "flip" : "personal",
    },
    { headers: DEALS_HEADERS },
  );
}

/**
 * Exact state scope: `?state=MO` and/or `?states=MO,KS`. Only 2-letter codes are
 * kept (uppercased, de-duped); NATIONWIDE / junk is ignored, i.e. no state filter.
 */
export function parseStates(
  searchParams: URLSearchParams,
): string[] | undefined {
  const raw = [
    searchParams.get("state") || "",
    ...(searchParams.get("states") || "").split(","),
  ];
  const states = Array.from(
    new Set(
      raw
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z]{2}$/.test(value)),
    ),
  );
  return states.length ? states : undefined;
}

function parseFilters(searchParams: URLSearchParams): DealFilters {
  return {
    states: parseStates(searchParams),
    source: searchParams.get("source")?.split(",").filter(Boolean),
    make: searchParams.get("make")?.split(",").filter(Boolean),
    condition: searchParams.get("condition")?.split(",").filter(Boolean),
    location: searchParams.get("location") || undefined,
    minProfit: searchParams.get("minProfit")
      ? parseInt(searchParams.get("minProfit")!, 10)
      : undefined,
    minScore: searchParams.get("minScore")
      ? parseInt(searchParams.get("minScore")!, 10)
      : undefined,
    sortBy: (searchParams.get("sortBy") as DealFilters["sortBy"]) || undefined,
    sortOrder:
      (searchParams.get("sortOrder") as DealFilters["sortOrder"]) || undefined,
    limit: searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : undefined,
    offset: searchParams.get("offset")
      ? parseInt(searchParams.get("offset")!, 10)
      : undefined,
  };
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { key: "deals", limit: 60, windowMs: 60000 });
  if (!rl.allowed) return tooManyRequests(rl);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      deals: [],
      total: 0,
      hasMore: false,
    });
  }

  try {
    const dealsService = new DealsService();
    const { searchParams } = new URL(request.url);
    const flipDesk = await resolveCallerFlipDesk();
    const filters = filtersForDesk(parseFilters(searchParams), flipDesk);

    const searchTerm = searchParams.get("search");
    if (searchTerm) {
      const result = await dealsService.searchDeals(searchTerm, filters);
      return deskResult(result, flipDesk);
    }

    const hot = searchParams.get("hot");
    // "Hot" is ranked by profit score: a flip-desk view only.
    if (hot === "true" && flipDesk) {
      const deals = await dealsService.getHotDeals(
        parseInt(searchParams.get("limit") || "10", 10),
      );
      return deskResult({ deals, total: deals.length, hasMore: false }, true);
    }

    const result = await dealsService.getDeals(filters);
    return deskResult(result, flipDesk);
  } catch (error) {
    console.error("Error in deals API:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch deals",
      },
      { status: 500 },
    );
  }
}
