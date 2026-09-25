// lib/scrapers/pipeline.ts
// Persistence helpers for scraped deals.

import { createClient } from "@supabase/supabase-js";
import { Deal } from "@/types";
import { QualityController } from "./tools/quality-control";
import { normalizeDeals } from "./tools/deal-normalizer";
import { analyzeDeal } from "@/lib/scoring/deal-analyzer";
import { loadMarketIndex } from "@/lib/scoring/market-value";
import { detectAvailability } from "@/lib/discovery/categorize";
import { extractOptions } from "./extract-options";
import { normalizeCondition } from "./normalize-condition";
import { extractContactInfo } from "./tools/extract-contact";
import { enrichVins } from "./enrich-vin";
import { sendAlertMatchEmail } from "@/lib/notifications/email";
import { sendAlertMatchSMS } from "@/lib/notifications/sms";
import { resolvePlaces } from "@/lib/geo/geocode";
import { withinMiles } from "@/lib/geo/distance";
import { cleanCity } from "@/lib/data/clean-location";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return createClient(supabaseUrl, supabaseKey);
}

export async function upsertDeals(deals: Partial<Deal>[]): Promise<number> {
  if (!deals.length) return 0;

  const now = new Date().toISOString();
  const quality = new QualityController();

  // Load the $0 market-comps index (cached) so the analyzer can value deals from real data.
  await loadMarketIndex(getSupabase());

  const source = deals[0]?.source || "unknown";
  const normalized = normalizeDeals(deals);
  // Authoritative make/model/year from the VIN (cache-first, vPIC for misses) BEFORE quality-control +
  // valuation — so deals are QC'd and valued on the correct vehicle and pool with their real comps.
  const vinApplied = await enrichVins(getSupabase(), normalized);
  if (vinApplied)
    console.log(`[Pipeline] VIN-decoded make/model on ${vinApplied} deals`);
  const report = quality.validateBatch(source, normalized);
  if (report.issues.length > 0) {
    console.warn(`[Pipeline] quality report for ${source}:`, report);
  }

  const rows = report.validDeals
    .filter(
      (deal) =>
        deal.year &&
        deal.year > 1900 &&
        deal.make &&
        deal.model &&
        typeof deal.ask_price === "number" &&
        deal.ask_price > 0,
    )
    .map((deal) => {
      const analysis = analyzeDeal(deal);
      const source_deal_id =
        deal.source_deal_id ||
        deal.id ||
        `${deal.source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Smart intelligence: extract hidden contact info/VINs from free text
      const extractedContact = extractContactInfo(
        `${deal.title || ""} ${(deal as any).description || ""}`,
      );

      const phone = deal.seller_phone || extractedContact.phone;
      const email = deal.seller_email || extractedContact.email;
      const vin = deal.vin || extractedContact.vin;

      // Omit `id` to allow Supabase to generate UUID, but include source_deal_id
      return {
        source: deal.source,
        source_deal_id,
        source_url: deal.source_url,
        // dealer_id is a UUID FK — coerce anything that isn't a real UUID to null so one bad value
        // (e.g. a hostname slug from auto-discovery) can't fail the type and drop the whole batch.
        dealer_id:
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            String(deal.dealer_id || ""),
          )
            ? deal.dealer_id
            : null,
        title: deal.title,
        year: deal.year || 0,
        make: deal.make,
        model: deal.model,
        trim: deal.trim,
        vin: vin,
        // Structured options (drivetrain / transmission / fuel / features) + seller contact folded under
        // options.contact (jsonb — exists). NOTE: the seller_phone/seller_email COLUMNS do not exist;
        // writing them was rejecting EVERY insert (PGRST schema error) and silently breaking ingestion.
        options: {
          ...extractOptions(
            `${deal.title || ""} ${(deal as any).description || ""}`,
          ),
          // Let scrapers contribute structured options (e.g. AutoTrader's free KBB price rating).
          ...(typeof (deal as any).options === "object" && (deal as any).options
            ? (deal as any).options
            : {}),
          contact:
            phone || email
              ? { phone, email }
              : ((deal as any).options?.contact ?? undefined),
        },
        ask_price: deal.ask_price,
        mileage: deal.mileage,
        // Coerce to the listing_condition enum — AI-rescue / bespoke salvage sites emit free text
        // ("Clean Title", "Non-Repairable") that the enum rejects, which silently dropped every row.
        // condition is NOT NULL, so fall back to run_drive when nothing maps rather than drop the row.
        condition: normalizeCondition(deal.condition) ?? "run_drive",
        damage_type: deal.damage_type,
        availability_status: detectAvailability(
          deal.title,
          (deal as any).description,
        ),
        // Reject scraper junk (ad copy, dealer names, street addresses) so the map/geocoder/filters
        // only ever see real city names.
        location_city: cleanCity(deal.location_city),
        location_state: deal.location_state,
        location_zip: deal.location_zip,
        // A listing we just re-observed IS available → force active. This is what makes the staleness prune
        // SELF-HEALING: if a still-listed car was wrongly deactivated (a scraper missed it one cycle), the
        // next scrape that sees it flips it back on. Without this, deactivation was permanent + unsafe.
        active: true,
        // Listing photos (the `images` text[] column exists). Without this every scraped/ingested
        // deal showed a placeholder card.
        images: Array.isArray(deal.images) ? deal.images.slice(0, 12) : [],
        // seller / seller_type columns exist (5k+ rows already populated) and most scrapers set them —
        // writing them here unlocks real Seller-Type filtering (Dealer / Auction / Private).
        seller: (deal as any).seller ?? null,
        seller_type: (deal as any).seller_type ?? null,
        // Absent columns kept OUT of the upsert — writing a non-existent column rejects the whole row.
        // description: deal.description,
        // auction_end: deal.auction_end,
        // bid_count: deal.bid_count,
        // seller_phone / seller_email do NOT exist — contact lives in options.contact above.
        estimated_transport_cost: analysis.transportCost,
        estimated_repair_cost: analysis.repairCost,
        true_net_profit: analysis.profit,
        profit_score: analysis.score,
        is_arbitrage_opportunity: analysis.verdict === "go",
        // Free market-value anchor when a scraper has one (AutoTrader ships KBB Fair Purchase Price on
        // every listing — a legit MMR-equivalent benchmark). Shown on cards + available to valuation.
        mmr_value: (deal as any).mmr_value ?? null,
        sell_estimate: analysis.sellEstimate,
        recommended_max_bid: analysis.recommendedMaxBid,
        deal_verdict: analysis.verdict,
        deal_analysis: {
          roi: Math.round(analysis.roi * 10) / 10,
          profitMargin: Math.round(analysis.profitMargin * 10) / 10,
          breakEvenDay: analysis.breakEvenDay,
          sellBasis: analysis.sellBasis,
          transportMiles: analysis.miles,
          costs: {
            acquisition: analysis.acquisitionCost,
            repair: analysis.repairCost,
            transport: analysis.transportCost,
            holding: analysis.holdingCost,
            selling: analysis.sellingCost,
            total: analysis.totalCost,
          },
          scoreBreakdown: analysis.scoreBreakdown,
          warnings: analysis.warnings,
          recommendations: analysis.recommendations,
          priceImplausible: analysis.priceImplausible,
          // Evidence + adjustments behind the resale number — powers the "How we valued this" card.
          valuation: analysis.valuation,
          // Forward-looking forecasts (time-to-sell, price-drop odds, urgency, projected ROI).
          prediction: analysis.prediction,
        },
        created_at: deal.created_at || now,
        updated_at: now,
        // Advance last_seen_at on every re-observation so days-on-market / listing velocity actually
        // accrues. first_seen_at is deliberately NOT set here — it keeps its insert default (now())
        // and isn't in the ON CONFLICT update set, so the (last_seen - first_seen) span grows each
        // cycle a listing is re-seen. Without this, days-on-market is permanently 0.
        last_seen_at: now,
      };
    });

  if (rows.length === 0) return 0;

  // Geocode each deal's location (cached + free) so the map and saved-search radius matching work.
  // Best-effort: any failure leaves lat/lng null and the upsert proceeds unchanged. A DB trigger
  // derives the PostGIS `location` column from lat/lng.
  try {
    const coords = await resolvePlaces(
      getSupabase(),
      rows.map((r) => ({
        zip: r.location_zip,
        city: r.location_city,
        state: r.location_state,
      })),
    );
    if (coords.size > 0) {
      for (const r of rows as any[]) {
        const key = r.location_zip
          ? `zip:${String(r.location_zip).match(/\b(\d{5})\b/)?.[1] || ""}`
          : r.location_city && r.location_state
            ? `cs:${String(r.location_city).trim().toLowerCase().replace(/\s+/g, " ")}|${String(r.location_state).trim().toLowerCase()}`
            : "";
        const c = key ? coords.get(key) : undefined;
        if (c) {
          r.lat = c.lat;
          r.lng = c.lng;
        }
      }
    }
  } catch (e) {
    console.warn("[upsertDeals] geocoding skipped:", (e as Error).message);
  }

  const SELECT_COLS =
    "id, source, ask_price, updated_at, vin, make, model, year, true_net_profit, deal_verdict, lat, lng";
  const sb = getSupabase();
  let { data: upsertedRows, error } = await sb
    .from("deals")
    .upsert(rows, {
      onConflict: "source,source_deal_id",
      ignoreDuplicates: false,
    })
    .select(SELECT_COLS);

  // Self-heal a schema mismatch: a non-existent column rejects the WHOLE batch, and the per-row retry
  // below would then drop EVERY row (they all carry it) — that exact bug once killed all ingestion. So
  // when the error names a missing column, strip it from every row and retry the batch. Loop for several.
  let healedRows: any[] = rows;
  let heals = 0;
  while (error && heals < 8) {
    const col = error.message.match(
      /Could not find the '([^']+)' column|'([^']+)' column of/i,
    );
    const bad = col?.[1] || col?.[2];
    if (!bad) break;
    heals++;
    console.warn(
      `[upsertDeals] unknown column '${bad}' — stripping it and retrying the batch (heal ${heals})`,
    );
    healedRows = healedRows.map((r) => {
      const c = { ...r };
      delete c[bad];
      return c;
    });
    const retry = await sb
      .from("deals")
      .upsert(healedRows, {
        onConflict: "source,source_deal_id",
        ignoreDuplicates: false,
      })
      .select(SELECT_COLS);
    error = retry.error;
    upsertedRows = retry.data;
  }

  if (error) {
    // A batch fails atomically, so one bad row (e.g. an enum/type violation) would otherwise lose
    // the whole batch. Fall back to per-row upserts: keep the good rows, skip + log the offenders.
    console.warn(
      `[upsertDeals] batch failed (${error.message}); retrying per-row to salvage good rows`,
    );
    const salvaged: any[] = [];
    for (const row of healedRows) {
      const { data, error: rowErr } = await sb
        .from("deals")
        .upsert([row], {
          onConflict: "source,source_deal_id",
          ignoreDuplicates: false,
        })
        .select(SELECT_COLS);
      if (rowErr)
        console.warn(
          `[upsertDeals] skipped ${row.source}/${row.source_deal_id}: ${rowErr.message}`,
        );
      else if (data) salvaged.push(...data);
    }
    upsertedRows = salvaged;
    error = null;
  }

  const returnedRows = upsertedRows || [];

  // Insert price history for deals that have a price
  const priceHistoryRows = returnedRows
    .filter((r) => typeof r.ask_price === "number")
    .map((r) => ({
      deal_id: r.id,
      price: r.ask_price,
      observed_at: r.updated_at,
    }));

  if (priceHistoryRows.length > 0) {
    const { error: priceError } = await getSupabase()
      .from("price_history")
      .insert(priceHistoryRows);

    if (priceError) {
      console.warn("[upsertDeals] Price history insert warning:", priceError);
    }
  }

  // Mark duplicate deals by VIN
  const vinRows = returnedRows.filter((r) => r.vin);
  if (vinRows.length > 0) {
    await markDuplicatesByVin(vinRows.map((r) => r.vin as string));
  }

  // Evaluate against user_saved_searches
  if (returnedRows.length > 0) {
    await matchUserSearches(returnedRows);
  }

  return rows.length;
}

async function markDuplicatesByVin(vins: string[]): Promise<void> {
  const { error } = await getSupabase().rpc("detect_duplicates_by_vin", {
    vin_filter: vins,
  });

  if (error) {
    // Fallback to RPC without parameter if function doesn't accept it
    const { error: fallbackError } = await getSupabase().rpc(
      "detect_duplicates_by_vin",
    );
    if (fallbackError) {
      console.warn("[upsertDeals] Duplicate detection warning:", fallbackError);
    }
  }
}

export async function insertPriceHistory(
  dealId: string,
  price: number,
  _source?: string,
): Promise<void> {
  const { error } = await getSupabase().from("price_history").insert({
    deal_id: dealId,
    price,
    observed_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[insertPriceHistory] Error:", error);
  }
}

async function matchUserSearches(deals: any[]): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data: searches, error } = await supabase
      .from("user_saved_searches")
      .select("*")
      .eq("is_active", true);

    if (error || !searches || searches.length === 0) return;

    // Home coordinates per user — needed for any search that uses max_distance_miles. One query.
    const homeByUser = new Map<string, { lat: number; lng: number }>();
    const needsRadius = searches.some(
      (s: any) => s.max_distance_miles && s.max_distance_miles > 0,
    );
    if (needsRadius) {
      const userIds = Array.from(new Set(searches.map((s: any) => s.user_id)));
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, home_lat, home_lng")
        .in("id", userIds);
      for (const p of profiles || []) {
        if (p.home_lat != null && p.home_lng != null)
          homeByUser.set(p.id, { lat: p.home_lat, lng: p.home_lng });
      }
    }

    // A match is keyed by (user_id, deal_id) — the inbox unique constraint.
    // We also remember which search produced it so we can honor that search's notify flags.
    type MatchItem = {
      user_id: string;
      search_id: string;
      deal_id: string;
      status: "unread";
      notify_email: boolean;
      notify_sms: boolean;
      min_count: number;
      deal: any;
    };

    const matches: MatchItem[] = [];

    for (const deal of deals) {
      for (const search of searches) {
        let matched = true;

        if (
          search.make &&
          search.make.toLowerCase() !== deal.make?.toLowerCase()
        )
          matched = false;
        if (
          search.model &&
          search.model.toLowerCase() !== deal.model?.toLowerCase()
        )
          matched = false;
        if (search.min_year && deal.year < search.min_year) matched = false;
        if (search.max_year && deal.year > search.max_year) matched = false;
        if (search.max_price && deal.ask_price > search.max_price)
          matched = false;

        // Profit gate (Saved Search Alerts): require the engine's net profit to clear the target.
        if (
          search.target_profit &&
          Number(deal.true_net_profit ?? 0) < Number(search.target_profit)
        ) {
          matched = false;
        }

        // Verdict gate: only notify on engine-verdict GO deals when the search opts in.
        if (search.require_go && deal.deal_verdict !== "go") matched = false;

        // Radius gate: if the search sets a max distance and we know the dealer's home + the deal's
        // coords, require the deal to fall within range. If either side lacks coordinates we DON'T
        // gate on distance (avoid silently hiding deals we just couldn't place).
        if (search.max_distance_miles && search.max_distance_miles > 0) {
          const home = homeByUser.get(search.user_id);
          if (home && deal.lat != null && deal.lng != null) {
            if (
              !withinMiles(
                home,
                { lat: deal.lat, lng: deal.lng },
                Number(search.max_distance_miles),
              )
            ) {
              matched = false;
            }
          }
        }

        if (matched) {
          matches.push({
            user_id: search.user_id,
            search_id: search.id,
            deal_id: deal.id,
            status: "unread",
            // notify flags default to email-on, sms-off per schema defaults
            notify_email: search.notify_email !== false,
            notify_sms: search.notify_sms === true,
            min_count: Math.max(1, Number(search.min_count) || 1),
            deal,
          });
        }
      }
    }

    if (matches.length === 0) return;

    // Determine which (user_id, deal_id) pairs already exist in the inbox so we
    // only notify on GENUINELY NEW matches. The upsert ignores duplicates, which
    // is what keeps the inbox idempotent, but it doesn't tell us what was inserted —
    // so we compute the new set ourselves up front.
    const userIds = Array.from(new Set(matches.map((m) => m.user_id)));
    const dealIds = Array.from(new Set(matches.map((m) => m.deal_id)));

    const { data: existingRows } = await supabase
      .from("user_feed_inbox")
      .select("user_id, deal_id")
      .in("user_id", userIds)
      .in("deal_id", dealIds);

    const existingKeys = new Set(
      (existingRows || []).map((r) => `${r.user_id}:${r.deal_id}`),
    );

    // De-dupe matches against the inbox AND against each other (a deal can match
    // multiple of a user's searches; the inbox row is per user+deal).
    const seenKeys = new Set<string>();
    const newMatches: MatchItem[] = [];
    for (const m of matches) {
      const key = `${m.user_id}:${m.deal_id}`;
      if (existingKeys.has(key) || seenKeys.has(key)) continue;
      seenKeys.add(key);
      newMatches.push(m);
    }

    const inboxItems = matches.map((m) => ({
      user_id: m.user_id,
      search_id: m.search_id,
      deal_id: m.deal_id,
      status: m.status,
    }));

    const { error: insertError } = await supabase
      .from("user_feed_inbox")
      .upsert(inboxItems, {
        onConflict: "user_id,deal_id",
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.warn(
        "[pipeline] Error inserting into user_feed_inbox:",
        insertError.message,
      );
    } else {
      console.log(
        `[pipeline] Matched ${inboxItems.length} inbox candidates (${newMatches.length} new).`,
      );
    }

    // Bulk/multi-unit gate: a search with min_count > 1 (e.g. "alert me when 3+ vans appear")
    // should only PUSH once that many fresh units have landed this cycle. The inbox still records
    // every match; we just hold the email/SMS until the volume threshold is met.
    const freshPerSearch = new Map<string, number>();
    for (const m of newMatches)
      freshPerSearch.set(
        m.search_id,
        (freshPerSearch.get(m.search_id) || 0) + 1,
      );
    const notifiable = newMatches.filter(
      (m) => (freshPerSearch.get(m.search_id) || 0) >= m.min_count,
    );

    // Send email/SMS only for newly-created inbox rows whose search opted in and cleared its threshold.
    if (notifiable.length > 0) {
      await notifyNewMatches(supabase, notifiable);
    }
  } catch (err) {
    console.warn(
      "[pipeline] matchUserSearches failed. Table might not exist yet:",
      err,
    );
  }
}

// Resolve a user's email/phone (cached per run) and dispatch alert notifications.
async function notifyNewMatches(
  supabase: ReturnType<typeof getSupabase>,
  matches: Array<{
    user_id: string;
    notify_email: boolean;
    notify_sms: boolean;
    deal: any;
  }>,
): Promise<void> {
  // Email/SMS push is a Pro feature when gating is on. Free dealers keep the in-app inbox (already
  // written upstream); they just don't get pushed. No-op until GATING_ENABLED=true.
  if (process.env.GATING_ENABLED === "true" && matches.length) {
    const { getUserPlan, isPaid } = await import("@/lib/auth/plan");
    const paid = new Map<string, boolean>();
    for (const uid of Array.from(new Set(matches.map((m) => m.user_id)))) {
      paid.set(uid, isPaid(await getUserPlan(supabase, uid)));
    }
    matches = matches.filter((m) => paid.get(m.user_id));
    if (!matches.length) return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  // Cache resolved contact info so we never look up the same user twice per run.
  const contactCache = new Map<
    string,
    { email: string | null; phone: string | null }
  >();

  // Enrich deals with profit (not present on the rows passed into matchUserSearches).
  const profitByDeal = new Map<string, number>();
  try {
    const dealIds = Array.from(
      new Set(matches.map((m) => m.deal?.id).filter(Boolean)),
    );
    if (dealIds.length > 0) {
      const { data: dealRows } = await supabase
        .from("deals")
        .select("id, true_net_profit")
        .in("id", dealIds);
      for (const row of dealRows || []) {
        if (typeof row.true_net_profit === "number")
          profitByDeal.set(row.id, row.true_net_profit);
      }
    }
  } catch (err) {
    console.warn(
      "[pipeline] Failed to enrich deals with profit for notifications:",
      err,
    );
  }

  async function getContact(userId: string) {
    if (contactCache.has(userId)) return contactCache.get(userId)!;
    let contact: { email: string | null; phone: string | null } = {
      email: null,
      phone: null,
    };
    try {
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (!error && data?.user) {
        contact = {
          email: data.user.email ?? null,
          phone: data.user.phone ?? null,
        };
      }
    } catch (err) {
      console.warn(
        "[pipeline] Failed to resolve user contact for notifications:",
        err,
      );
    }
    contactCache.set(userId, contact);
    return contact;
  }

  for (const m of matches) {
    if (!m.notify_email && !m.notify_sms) continue;

    const deal = m.deal;
    const vehicleTitle =
      [deal.year, deal.make, deal.model].filter(Boolean).join(" ").trim() ||
      "New vehicle match";
    const askPrice = typeof deal.ask_price === "number" ? deal.ask_price : 0;
    const estimatedProfit =
      profitByDeal.get(deal.id) ??
      (typeof deal.true_net_profit === "number" ? deal.true_net_profit : 0);
    const dealUrl = `${appUrl}/deal/${deal.id}`;

    const contact = await getContact(m.user_id);

    if (m.notify_email && contact.email) {
      try {
        await sendAlertMatchEmail({
          to: contact.email,
          dealerName: "there",
          vehicleTitle,
          askPrice,
          estimatedProfit,
          dealUrl,
        });
      } catch (err) {
        console.warn("[pipeline] Alert email send failed:", err);
      }
    }

    if (m.notify_sms && contact.phone) {
      try {
        await sendAlertMatchSMS({
          to: contact.phone,
          vehicleTitle,
          askPrice,
          estimatedProfit,
          dealUrl,
        });
      } catch (err) {
        console.warn("[pipeline] Alert SMS send failed:", err);
      }
    }
  }
}
