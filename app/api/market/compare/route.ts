export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { RECOMMENDATION_FIELDS } from "@/lib/deals/recommendation-evidence";
import { titleCaseMake } from "@/lib/vehicle/canonical";
import {
  comparisonSample,
  modelVariants,
} from "@/lib/market/comparison-sample";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { applyBuyableInventory } from "@/lib/search/customer-inventory";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "compare", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);
  const specs = (req.nextUrl.searchParams.get("vehicles") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!specs.length) return NextResponse.json({ comparison: [] }, { headers });
  if (
    specs.length > 4 ||
    specs.some((s) => {
      const parts = s.split(":");
      return (
        parts.length > 3 ||
        !parts[0] ||
        !parts[1] ||
        !parts
          .slice(0, 2)
          .every((v) =>
            new RegExp("^[\\p{L}\\p{N} .'-]{1,60}$", "u").test(v),
          ) ||
        (parts[2] && !/^(19|20)\d{2}$/.test(parts[2]))
      );
    })
  )
    return NextResponse.json(
      {
        error:
          "Choose up to four vehicles with a full make, model and optional four-digit year.",
      },
      { status: 400, headers },
    );
  if (!isSupabaseConfigured()) return unavailable();
  try {
    const db = createServerComponentClient();
    const flipDesk = await resolveCallerFlipDesk();
    const comparison = await Promise.all(
      specs.map(async (spec) => {
        const [make, model, yearText] = spec.split(":");
        const year = yearText ? Number(yearText) : undefined;
        let q = applyBuyableInventory(
          db
            .from("deals")
            .select(
              `${RECOMMENDATION_FIELDS},fuel_type,drivetrain,transmission`,
              { count: "exact" },
            ),
        )
          .ilike("make", titleCaseMake(make))
          .or(
            modelVariants(model)
              .map((v) => `model.ilike."${v}"`)
              .join(","),
          )
          .order("last_seen_at", { ascending: false })
          .order("id", { ascending: true })
          .limit(800);
        if (year) q = q.eq("year", year);
        const { data, error, count } = await q.abortSignal(
          AbortSignal.timeout(10000),
        );
        if (error || !Array.isArray(data))
          throw new Error("Comparison unavailable");
        const result = comparisonSample(
          data,
          { make, model, year },
          count ?? null,
        );
        if (flipDesk) return result;
        const { avgProfit: _profit, ...safe } = result;
        return safe;
      }),
    );
    return NextResponse.json(
      { comparison, deskAccess: flipDesk ? "flip" : "personal" },
      { headers },
    );
  } catch {
    return unavailable();
  }
}
function unavailable() {
  return NextResponse.json(
    {
      error:
        "Market comparison is temporarily unavailable. Your vehicle choices are unchanged.",
      status: "unavailable",
    },
    { status: 503, headers },
  );
}
