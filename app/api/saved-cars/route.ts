// app/api/saved-cars/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  sourceBackedSavedSnapshot,
  sanitizeClientProofSnapshot,
} from "@/lib/saved/proof-snapshot";
import { withLatestObservations } from "@/lib/saved/latest-observation";
import { titleSourceOf } from "@/lib/deals/title-category";
import {
  isSupabaseConfigured,
  createServerComponentClient,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { recordDealSignal } from "@/lib/reco/signals";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { savedCarsForDesk } from "@/lib/saved/saved-car-desk-redact";
import { listingPriceEvidence } from "@/lib/deals/acquisition-price";
import { parseSavedCursor, SAVED_PAGE_SIZE } from "@/lib/saved/collection";
import {
  CHECKLIST_SELECT,
  SAVED_CARS_LIMIT,
  toChecklistRow,
} from "@/lib/saved/purchase-checklist";

export const dynamic = "force-dynamic";

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

    const expectedOwner = request.headers.get("X-Save-Owner");
    if (expectedOwner && expectedOwner !== userId)
      return NextResponse.json(
        { error: "Account changed. Reload and retry." },
        { status: 409 },
      );

    if (searchParams.get("view") === "membership") {
      const dealId = searchParams.get("dealId");
      if (
        !dealId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          dealId,
        )
      )
        return NextResponse.json({ error: "Invalid vehicle" }, { status: 400 });
      if (!isSupabaseConfigured())
        return NextResponse.json(
          { error: "Saved vehicles unavailable" },
          { status: 503 },
        );
      // Filter before limiting: an older save remains recognizable in collections larger than 500.
      const { data, error } = await supabase
        .from("saved_cars")
        .select("id")
        .eq("user_id", userId)
        .eq("deal_id", dealId)
        .limit(1);
      if (error) throw error;
      return NextResponse.json({
        ownerId: userId,
        dealId,
        savedId: data?.[0]?.id ?? null,
      });
    }

    if (!isSupabaseConfigured()) {
      if (["page", "checklist-page"].includes(searchParams.get("view") || ""))
        return NextResponse.json(
          { error: "Saved vehicles unavailable" },
          { status: 503 },
        );
      return NextResponse.json([]);
    }

    const pagedView = searchParams.get("view");
    if (pagedView === "page" || pagedView === "checklist-page") {
      let cursor;
      try {
        cursor = searchParams.has("cursor")
          ? parseSavedCursor(searchParams.get("cursor")!)
          : null;
      } catch {
        return NextResponse.json(
          { error: "Invalid saved cursor" },
          { status: 400 },
        );
      }
      let query = supabase
        .from("saved_cars")
        .select(pagedView === "checklist-page" ? CHECKLIST_SELECT : "*")
        .eq("user_id", userId);
      if (filter === "active")
        query = query.in("status", [
          "active",
          "watching",
          "price_drop",
          "price_increase",
        ]);
      else if (filter === "price_drops")
        query = query.eq("status", "price_drop");
      else if (filter === "gone") query = query.eq("status", "unavailable");
      else if (filter !== "all")
        return NextResponse.json(
          { error: "Invalid saved filter" },
          { status: 400 },
        );
      if (cursor) {
        if (cursor.savedAt === null)
          query = query.is("saved_at", null).lt("id", cursor.id);
        else
          query = query.or(
            `saved_at.lt.${cursor.savedAt},and(saved_at.eq.${cursor.savedAt},id.lt.${cursor.id}),saved_at.is.null`,
          );
      }
      const { data, error } = await query
        .order("saved_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(SAVED_PAGE_SIZE + 1);
      if (error) throw error;
      const rows = ((data || []) as Record<string, any>[]).slice(
        0,
        SAVED_PAGE_SIZE,
      );
      const last = rows.at(-1);
      const nextCursor =
        data && data.length > SAVED_PAGE_SIZE && last
          ? JSON.stringify({ savedAt: last.saved_at ?? null, id: last.id })
          : null;
      return NextResponse.json({
        ownerId: userId,
        rows:
          pagedView === "checklist-page"
            ? rows.map(toChecklistRow)
            : savedCarsForDesk(
                await withLatestObservations(supabase, rows),
                await resolveCallerFlipDesk(),
              ),
        nextCursor,
      });
    }

    // view=checklist (/fleet Purchase plan) needs no snapshot JSON — slim projection.
    const checklistView = searchParams.get("view") === "checklist";
    const buildQuery = (columns: string) => {
      let q = supabase.from("saved_cars").select(columns).eq("user_id", userId);
      if (filter === "active") {
        q = q.in("status", ["active", "price_drop", "price_increase"]);
      } else if (filter === "price_drops") {
        q = q.eq("status", "price_drop");
      } else if (filter === "ending_soon") {
        q = q.eq("status", "ending_soon");
      } else if (filter === "gone" || filter === "unavailable") {
        q = q.eq("status", "unavailable");
      }
      return q.order("saved_at", { ascending: false }).limit(SAVED_CARS_LIMIT);
    };

    if (checklistView) {
      let { data, error } = await buildQuery(CHECKLIST_SELECT);
      // Projection unsupported for some reason → fall back to full rows rather than fail the page.
      if (error) ({ data, error } = await buildQuery("*"));
      if (error) throw error;
      return NextResponse.json((data || []).map(toChecklistRow));
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

    const { data, error } = await query
      .order("saved_at", { ascending: false })
      .limit(SAVED_CARS_LIMIT);
    if (error) throw error;

    // Redact on READ (not on save) so a desk switch is honored for existing snapshots.
    const flipDesk = await resolveCallerFlipDesk();
    return NextResponse.json(
      savedCarsForDesk(
        await withLatestObservations(
          supabase,
          (data || []) as Record<string, any>[],
        ),
        flipDesk,
      ),
    );
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

    // A stale tab must not save into a different account after a session switch.
    const expectedOwner = request.headers.get("X-Save-Owner");
    if (expectedOwner && expectedOwner !== userId)
      return NextResponse.json(
        { error: "Account changed. Reload and retry." },
        { status: 409 },
      );

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
      // options.titleSource only (#211): lets the saved badge show a source-default title as weaker.
      titleSource: titleSourceOf(deal),
      condition: deal.condition,
      damageType: deal.damage_type || deal.damageType,
      odometer: deal.mileage,
      askingPrice: deal.ask_price,
      priceEvidence: listingPriceEvidence(deal),
      analysis: deal.deal_analysis
        ? {
            valuation: deal.deal_analysis.valuation,
            evidenceGates: deal.deal_analysis.evidenceGates,
          }
        : undefined,
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
      photoAudit: deal.options?.photoAudit,
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
    };
    const snapshotWithTrust = sourceBackedSavedSnapshot(snapshot, clientProof);

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

    // Recommendation signal: a save is the strongest positive. Best-effort.
    await recordDealSignal(supabase, userId, "save", deal);

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    console.error("[SAVED-CARS-API] POST error:", error);
    console.error("[saved-cars]", error.message);
    return NextResponse.json({ error: "Failed to save car" }, { status: 500 });
  }
}
