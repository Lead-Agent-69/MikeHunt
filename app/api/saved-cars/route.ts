// app/api/saved-cars/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";

export const dynamic = "force-dynamic";

export function savedTrustExplanation(snapshot: {
  vin?: string | null;
  odometer?: number | null;
  titleType?: string | null;
  sellerType?: string | null;
  seller?: string | null;
  sourceUrl?: string | null;
  images?: string[] | null;
  estimatedProfit?: number | null;
  profitScore?: number | null;
  dataQuality?: { score: number; missing: string[] };
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  sellerContactUrl?: string | null;
  auctionEndAt?: string | null;
}) {
  const qualityScore = Number(snapshot.dataQuality?.score || 0);
  const profit = Number(snapshot.estimatedProfit || 0);
  const reasons = [
    snapshot.sourceUrl ? "Original source link is present" : null,
    snapshot.images?.length
      ? `${snapshot.images.length} photo${snapshot.images.length === 1 ? "" : "s"}`
      : null,
    snapshot.vin ? "VIN captured" : null,
    snapshot.odometer ? "Mileage captured" : null,
    snapshot.auctionEndAt ? "Auction end is known" : null,
    snapshot.seller || snapshot.sellerType
      ? "Seller/source is identified"
      : null,
    profit > 0
      ? `$${Math.round(profit).toLocaleString()} estimated spread`
      : null,
  ].filter(Boolean) as string[];
  const nextChecks = [
    snapshot.vin ? null : "verify VIN",
    snapshot.odometer ? null : "verify mileage",
    snapshot.titleType ? null : "confirm title type",
    snapshot.sellerPhone || snapshot.sellerEmail || snapshot.sellerContactUrl
      ? null
      : "find seller contact path",
    snapshot.auctionEndAt ? null : "confirm auction timing",
    snapshot.profitScore || profit ? null : "validate resale and fee math",
  ].filter(Boolean) as string[];
  const confidence =
    qualityScore >= 80 && reasons.length >= 5
      ? "high"
      : qualityScore >= 60 && reasons.length >= 3
        ? "medium"
        : "low";
  return {
    confidence,
    score: Math.round(
      Math.min(
        100,
        qualityScore * 0.55 +
          Math.min(25, reasons.length * 5) +
          (snapshot.sourceUrl ? 10 : 0) +
          (profit > 0 ? 10 : 0),
      ),
    ),
    reasons: reasons.slice(0, 5),
    missing: snapshot.dataQuality?.missing || [],
    nextChecks: nextChecks.slice(0, 4),
    summary: reasons.length
      ? reasons.slice(0, 3).join(" · ")
      : "Thin proof: verify original listing details before acting.",
  };
}

function sanitizeStringList(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export function sanitizeClientProofSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const input = value as any;
  const quality = input.dataQuality;
  const trust = input.trustExplanation;
  const sanitized: {
    dataQuality?: { score: number; label?: string; missing: string[] };
    trustExplanation?: {
      confidence?: string;
      score?: number;
      reasons?: string[];
      missing?: string[];
      nextChecks?: string[];
      summary?: string;
    };
  } = {};

  if (quality && typeof quality === "object") {
    sanitized.dataQuality = {
      score: Math.max(0, Math.min(100, Number(quality.score || 0))),
      label:
        typeof quality.label === "string"
          ? quality.label.slice(0, 40)
          : undefined,
      missing: sanitizeStringList(quality.missing, 12) || [],
    };
  }

  if (trust && typeof trust === "object") {
    sanitized.trustExplanation = {
      confidence:
        typeof trust.confidence === "string"
          ? trust.confidence.slice(0, 20)
          : undefined,
      score:
        trust.score != null
          ? Math.max(0, Math.min(100, Number(trust.score || 0)))
          : undefined,
      reasons: sanitizeStringList(trust.reasons, 8),
      missing: sanitizeStringList(trust.missing, 12),
      nextChecks: sanitizeStringList(trust.nextChecks, 8),
      summary:
        typeof trust.summary === "string"
          ? trust.summary.slice(0, 240)
          : undefined,
    };
  }

  return sanitized;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
    } = await getServerUser();

    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";

    if (!isSupabaseConfigured()) {
      return NextResponse.json([]);
    }

    let query = supabase.from("saved_cars").select("*").eq("user_id", userId);

    if (filter === "active") {
      query = query.in("status", ["active", "price_drop", "price_increase"]);
    } else if (filter === "price_drops") {
      query = query.eq("status", "price_drop");
    } else if (filter === "ending_soon") {
      query = query.eq("status", "ending_soon");
    } else if (filter === "gone" || filter === "unavailable") {
      query = query.eq("status", "unavailable");
    }

    const { data, error } = await query.order("saved_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("[SAVED-CARS-API] GET error:", error);
    console.error("[saved-cars]", error.message);
    return NextResponse.json(
      { error: "Failed to fetch saved cars" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerComponentClient();
    const {
      data: { user },
    } = await getServerUser();
    const userId = user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The dealer row is provisioned with id === auth user id (see /api/auth/provision).
    const dealerId: string = userId;

    const body = await request.json();
    const { dealId } = body;
    const clientProof = sanitizeClientProofSnapshot(body.snapshot);

    if (!dealId) {
      return NextResponse.json(
        { error: "dealId is required" },
        { status: 400 },
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        id: `demo-save-${dealId}`,
        demo: true,
      });
    }

    // Retrieve the deal details
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .maybeSingle();

    if (dealErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const titleType =
      deal.title_type ||
      deal.titleType ||
      deal.title_status ||
      deal.titleStatus ||
      deal.condition;
    const quality = gradeDataQuality({
      images: deal.images,
      imageUrl: Array.isArray(deal.images) ? deal.images[0] : undefined,
      vin: deal.vin,
      titleType,
      condition: deal.condition,
      damageType: deal.damage_type || deal.damageType,
      mileage: deal.mileage,
      locationCity: deal.location_city,
      locationState: deal.location_state,
      askPrice: deal.ask_price,
      seller: deal.seller,
      sellerType: deal.seller_type,
      sellerPhone: deal.seller_phone || deal.options?.contact?.phone,
      sellerEmail: deal.seller_email || deal.options?.contact?.email,
      sellerContactUrl:
        deal.seller_contact_url ||
        deal.sellerContactUrl ||
        deal.options?.contact?.url ||
        deal.source_url,
      auctionEndAt: deal.auction_end || deal.auction_end_at,
      sourceUrl: deal.source_url,
    });
    const trueNetProfit =
      deal.true_net_profit != null
        ? Number(deal.true_net_profit)
        : Number(deal.profit_estimate || 0);
    const repairEstimate =
      deal.repair_estimate != null
        ? Number(deal.repair_estimate)
        : deal.deal_analysis?.costs?.repair != null
          ? Number(deal.deal_analysis.costs.repair)
          : undefined;
    const transportEstimate =
      deal.transport_cost != null
        ? Number(deal.transport_cost)
        : deal.deal_analysis?.costs?.transport != null
          ? Number(deal.deal_analysis.costs.transport)
          : undefined;
    const sellerContactUrl =
      deal.seller_contact_url ||
      deal.sellerContactUrl ||
      deal.options?.contact?.url ||
      deal.source_url;
    const snapshot = {
      vin: deal.vin,
      year: deal.year,
      make: deal.make,
      model: deal.model,
      trim: deal.trim,
      titleType,
      condition: deal.condition,
      damageType: deal.damage_type || deal.damageType,
      odometer: deal.mileage,
      askingPrice: deal.ask_price,
      marketValue: deal.mmr_value,
      estimatedProfit: trueNetProfit,
      sellEstimate:
        deal.sell_estimate != null ? Number(deal.sell_estimate) : undefined,
      recommendedMaxBid:
        deal.recommended_max_bid != null
          ? Number(deal.recommended_max_bid)
          : undefined,
      repairEstimate,
      transportEstimate,
      profitScore: deal.profit_score,
      images: deal.images,
      locationCity: deal.location_city,
      locationState: deal.location_state,
      source: deal.source,
      seller: deal.seller,
      sellerType: deal.seller_type,
      sellerPhone: deal.seller_phone || deal.options?.contact?.phone,
      sellerEmail: deal.seller_email || deal.options?.contact?.email,
      sellerContactUrl,
      sourceUrl: deal.source_url,
      auctionEndAt: deal.auction_end || deal.auction_end_at,
      scrapedAt: deal.scraped_at,
      firstSeenAt: deal.first_seen_at,
      lastSeenAt: deal.last_seen_at || deal.scraped_at,
      dataQuality: {
        score: quality.score,
        label: quality.label,
        missing: quality.missing.map(fieldLabel),
      },
    };
    const serverTrust = savedTrustExplanation({
      ...snapshot,
      dataQuality: {
        score: quality.score,
        missing: quality.missing.map(fieldLabel),
      },
    });
    const snapshotWithTrust = {
      ...snapshot,
      ...clientProof,
      dataQuality: clientProof.dataQuality || snapshot.dataQuality,
      trustExplanation: clientProof.trustExplanation || serverTrust,
    };

    const { data: existing } = await supabase
      .from("saved_cars")
      .select("id")
      .eq("user_id", userId)
      .eq("deal_id", dealId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Deal already saved", id: existing.id },
        { status: 409 },
      );
    }

    const { data, error: insertErr } = await supabase
      .from("saved_cars")
      .insert({
        user_id: userId,
        dealer_id: dealerId,
        deal_id: dealId,
        snapshot: snapshotWithTrust,
        source_url: deal.source_url,
        source_name: deal.source,
        price_at_save: deal.ask_price,
        last_price_seen: deal.ask_price,
        market_value_at_save: deal.mmr_value,
        profit_at_save: trueNetProfit,
        status: "active",
        saved_at: new Date().toISOString(),
        last_checked: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    console.error("[SAVED-CARS-API] POST error:", error);
    console.error("[saved-cars]", error.message);
    return NextResponse.json({ error: "Failed to save car" }, { status: 500 });
  }
}
