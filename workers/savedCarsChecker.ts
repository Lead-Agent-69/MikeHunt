// workers/savedCarsChecker.ts
// Background worker checking availability and price updates on saved cars

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { pinnedRequest, resolvePinnedTarget } from "../lib/net/pinned-dns";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

export async function checkSavedCars() {
  console.log("[SAVED-CHECKER] Starting live check on saved cars...");

  // Get all active saved cars (status is active, price_drop, or price_increase)
  const { data: saves, error } = await supabase
    .from("saved_cars")
    .select(
      "id, user_id, dealer_id, deal_id, source_url, source_name, price_at_save, last_price_seen, status",
    )
    .in("status", ["active", "price_drop", "price_increase"])
    .order("last_checked", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[SAVED-CHECKER] Error fetching saved cars:", error.message);
    return;
  }

  if (!saves || saves.length === 0) {
    console.log("[SAVED-CHECKER] No active saved cars to check.");
    return;
  }

  console.log(`[SAVED-CHECKER] Checking ${saves.length} saved cars...`);

  for (const save of saves) {
    try {
      // 1. Check if the deal still exists and is active in the deals table
      const { data: deal, error: dealErr } = await supabase
        .from("deals")
        .select("id, ask_price, active, auction_end")
        .eq("id", save.deal_id)
        .maybeSingle();

      if (dealErr) {
        console.warn(
          `[SAVED-CHECKER] Error querying deal ${save.deal_id}:`,
          dealErr.message,
        );
        continue;
      }

      // If deal is missing from DB or inactive, perform URL check
      if (!deal || !deal.active) {
        // No URL to probe and the deal is gone from our inventory: treat as dead (as before).
        const liveness: Liveness = save.source_url
          ? await checkUrlAlive(save.source_url)
          : "dead";

        if (liveness === "unknown") {
          // Couldn't tell (guard refused, timeout, bot wall, 5xx, redirect loop): don't flip the
          // user's status on a guess. Only bump last_checked so the queue rotates.
          await supabase
            .from("saved_cars")
            .update({ last_checked: new Date().toISOString() })
            .eq("id", save.id);
          console.log(
            `[SAVED-CHECKER] Saved car ${save.id} (${save.source_name}) liveness unknown; status unchanged`,
          );
          continue;
        }

        const isLive = liveness === "alive";
        await supabase
          .from("saved_cars")
          .update({
            status: isLive ? "active" : "unavailable",
            last_checked: new Date().toISOString(),
            notified_unavailable: !isLive,
          })
          .eq("id", save.id);

        console.log(
          `[SAVED-CHECKER] Saved car ${save.id} (${save.source_name}) is now ${isLive ? "active" : "unavailable"}`,
        );
        continue;
      }

      // 2. Deal is active. Check for price changes
      const currentPrice = Number(deal.ask_price || 0);
      const savedPrice = Number(save.last_price_seen || 0);

      let newStatus = "active";
      if (currentPrice < savedPrice - 100) {
        newStatus = "price_drop";
      } else if (currentPrice > savedPrice + 100) {
        newStatus = "price_increase";
      }

      // Also detect if auction is ending soon (< 2 hours)
      if (deal.auction_end) {
        const timeRemaining = new Date(deal.auction_end).getTime() - Date.now();
        if (timeRemaining > 0 && timeRemaining < 2 * 60 * 60 * 1000) {
          newStatus = "ending_soon";
        }
      }

      await supabase
        .from("saved_cars")
        .update({
          status: newStatus,
          last_price_seen: currentPrice,
          last_checked: new Date().toISOString(),
        })
        .eq("id", save.id);

      if (newStatus !== save.status) {
        console.log(
          `[SAVED-CHECKER] Saved car ${save.id} changed status: ${save.status} -> ${newStatus}`,
        );
      }
    } catch (e: any) {
      console.error(
        `[SAVED-CHECKER] Error checking saved car ${save.id}:`,
        e.message,
      );
    }
  }

  console.log("[SAVED-CHECKER] Saved cars check complete.");
  return saves?.length ?? 0;
}

const ALIVE_MAX_REDIRECTS = 3;

export type Liveness = "alive" | "dead" | "unknown";

/**
 * HEAD a saved listing's source_url. source_url is user-supplied (save-from-url), so every hop is
 * resolved once, validated and pinned (lib/net/pinned-dns): no DNS-rebinding window, no redirect
 * onto metadata / localhost / RFC1918, and a non-public target gets no request at all.
 *
 * alive: 2xx. dead: 404 / 410 (the listing is gone). unknown: anything we can't be sure about,
 * including a guard refusal, so the caller leaves the user's status alone.
 */
export async function checkUrlAlive(url: string): Promise<Liveness> {
  try {
    let target = await resolvePinnedTarget(url);
    for (let hop = 0; hop <= ALIVE_MAX_REDIRECTS; hop++) {
      const res = await pinnedRequest(target, {
        method: "HEAD",
        timeoutMs: 5000,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.location;
        if (!loc) return "unknown";
        target = await resolvePinnedTarget(new URL(loc, target.url).toString());
        continue;
      }
      if (res.status >= 200 && res.status < 300) return "alive";
      if (res.status === 404 || res.status === 410) return "dead";
      return "unknown";
    }
    return "unknown";
  } catch {
    // UrlNotAllowedError, timeout, network error.
    return "unknown";
  }
}
