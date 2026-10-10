export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createServerComponentClient } from "@/lib/supabase";
import {
  SOLD_MEDIAN_WINDOW_DAYS,
  isWithinSoldWindow,
  soldTitleLane,
  soldWindowCutoffIso,
  summarizeCleanSold,
  normalizeModel,
} from "@/lib/scoring/market-value";
import { SOLD_BASIS, withSoldBasis } from "@/lib/scoring/sold-basis";

// GET /api/sold?make=Ford&model=F-150&year=2018 — completed-sale prices.
// A clean median is published only at n >= 3 clean titles. Salvage titles are
// counted and called out; they are not mixed into that price. Only sales inside the last
// SOLD_MEDIAN_WINDOW_DAYS count, so an old price is not shown as today's. No invented prices.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "sold", limit: 60, windowMs: 60000 });
  if (!rl.allowed) return tooManyRequests(rl);

  const sp = new URL(req.url).searchParams;
  const make = (sp.get("make") || "").trim();
  const model = (sp.get("model") || "").trim();
  const year = parseInt(sp.get("year") || "0", 10) || 0;
  if (!make || !model || !normalizeModel(model))
    return NextResponse.json({
      sales: [],
      median: null,
      count: 0,
      soldAt: null,
      mixed: false,
      note: null,
      windowDays: SOLD_MEDIAN_WINDOW_DAYS,
    });

  const supabase = createServerComponentClient();
  const normModel = normalizeModel(model);
  // Model match: the raw spelling (legacy/ingest rows) or the normalized one the eBay sold
  // collector stores ("F-150" -> "f150"). The or() list only carries PostgREST-safe text.
  const modelOr = /^[A-Za-z0-9 .-]+$/.test(model)
    ? `model.ilike.${model},model.eq.${normModel}`
    : `model.eq.${normModel}`;
  const build = (filterBasis: boolean) => {
    let q = supabase
      .from("sold_listings")
      .select(
        "year, make, model, trim, mileage, sold_price, sold_at, title, source, source_url, currency_code, country_code",
      )
      .ilike("make", make.replace(/[\\%_]/g, "\\$&"))
      .or(modelOr)
      .eq("currency_code", "USD")
      .eq("country_code", "US");
    if (filterBasis) q = q.eq("basis", SOLD_BASIS);
    q = q
      .gt("sold_price", 0)
      .gte("sold_at", soldWindowCutoffIso())
      .lte("sold_at", new Date().toISOString())
      .order("sold_at", { ascending: false })
      .limit(40);
    if (year > 0) q = q.gte("year", year - 2).lte("year", year + 2);
    return q;
  };

  let result;
  try {
    result = await withSoldBasis(build);
  } catch {
    result = { data: null, error: true };
  }
  const { data, error } = result;
  if (error)
    return NextResponse.json(
      {
        error:
          "Recent sale records are temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );

  const recentRows = (data || []).filter(
    (row: any) =>
      String(row.make || "")
        .trim()
        .toLowerCase() === make.toLowerCase() &&
      normalizeModel(row.model) === normModel &&
      Number.isFinite(Number(row.sold_price)) &&
      Number(row.sold_price) > 0 &&
      isWithinSoldWindow(row.sold_at),
  );
  const summary = summarizeCleanSold(recentRows);

  return NextResponse.json({
    median: summary.median,
    count: summary.count,
    soldAt: summary.soldAt,
    low: summary.low,
    high: summary.high,
    salvageCount: summary.salvageCount,
    unknownCount: summary.unknownCount,
    mixed: summary.mixed,
    note: summary.note,
    windowDays: summary.windowDays,
    checkedAt: new Date().toISOString(),
    evidenceLabel:
      "Source-reported sale records; title claims are not independently verified",
    sales: recentRows.slice(0, 6).map((d: any) => {
      const lane = soldTitleLane(d.title);
      const stored =
        typeof d.title === "string" ? d.title.replace(/\s+/g, " ").trim() : "";
      return {
        year: d.year,
        title:
          stored ||
          `${d.year || ""} ${d.make || ""} ${d.model || ""} ${d.trim || ""}`
            .replace(/\s+/g, " ")
            .trim(),
        lane,
        price: Math.round(Number(d.sold_price)),
        mileage: d.mileage || null,
        soldAt: d.sold_at,
        source: d.source,
        sourceUrl:
          typeof d.source_url === "string" && /^https?:\/\//i.test(d.source_url)
            ? d.source_url
            : null,
        currency: d.currency_code,
      };
    }),
  });
}
