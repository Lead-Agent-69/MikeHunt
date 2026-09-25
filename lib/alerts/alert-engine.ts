import { createServerComponentClient } from "@/lib/supabase";
import { sendPushToUser } from "@/lib/notifications/push";

const supabase = createServerComponentClient();

const money = (n: unknown) => `$${Math.round(Number(n) || 0).toLocaleString()}`;

export async function checkAlerts() {
  console.log("[ALERT-ENGINE] Running alert engine...");

  // Get all active alerts
  const { data: alerts, error: alertsErr } = await supabase
    .from("alerts")
    .select("*")
    .eq("active", true);

  if (alertsErr) {
    console.error("[ALERT-ENGINE] Error fetching alerts:", alertsErr.message);
    return;
  }

  if (!alerts?.length) {
    console.log("[ALERT-ENGINE] No active alerts found.");
    return;
  }

  // Get deals added in last 10 minutes
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: newDeals, error: dealsErr } = await supabase
    .from("deals")
    .select("*")
    .gte("created_at", since)
    .eq("active", true);

  if (dealsErr) {
    console.error("[ALERT-ENGINE] Error fetching new deals:", dealsErr.message);
    return;
  }

  if (!newDeals?.length) {
    console.log("[ALERT-ENGINE] No new deals found in last 10 minutes.");
    return;
  }

  console.log(
    `[ALERT-ENGINE] Matching ${alerts.length} alerts against ${newDeals.length} new deals...`,
  );

  for (const alert of alerts) {
    for (const deal of newDeals) {
      if (vehicleMatchesAlert(deal, alert)) {
        console.log(
          `[ALERT-ENGINE] Match found! Deal ${deal.id} matches alert ${alert.id} for user ${alert.user_id}`,
        );

        // Check if already matched
        const { data: existing } = await supabase
          .from("alert_matches")
          .select("id")
          .eq("alert_id", alert.id)
          .eq("deal_id", deal.id)
          .maybeSingle();

        if (existing) continue;

        // Insert match
        const { error: matchErr } = await supabase
          .from("alert_matches")
          .insert({
            alert_id: alert.id,
            deal_id: deal.id,
            dealer_id: alert.user_id,
            // Store the ACCURATE net profit (the engine's number) so the notification shows the real
            // figure, not the crude mmr−ask generated column.
            profit_estimate: deal.true_net_profit ?? deal.profit_estimate,
            notified: false,
          });

        if (matchErr) {
          console.error(
            `[ALERT-ENGINE] Error inserting match:`,
            matchErr.message,
          );
        } else {
          // Update alert trigger count and last triggered time
          const currentCount = alert.trigger_count || 0;
          await supabase
            .from("alerts")
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: currentCount + 1,
            })
            .eq("id", alert.id);

          // PUSH — the retention moment: ping the dealer the instant a matching deal lands. No-ops cleanly
          // if push isn't configured (no VAPID key) or they haven't subscribed a device.
          try {
            const title = `🔥 ${[deal.year, deal.make, deal.model].filter(Boolean).join(" ") || "New match"}`;
            const parts = [money(deal.ask_price)];
            if (
              deal.true_net_profit != null &&
              Number(deal.true_net_profit) > 0
            )
              parts.push(`+${money(deal.true_net_profit)} profit`);
            if (deal.location_state) parts.push(deal.location_state);
            const n = await sendPushToUser(supabase, alert.user_id, {
              title,
              body: parts.join(" · "),
              url: `/deal/${deal.id}`,
              tag: String(deal.id),
            });
            if (n > 0)
              await supabase
                .from("alert_matches")
                .update({ notified: true })
                .eq("alert_id", alert.id)
                .eq("deal_id", deal.id);
          } catch (e) {
            console.error("[ALERT-ENGINE] push send failed:", e);
          }
        }
      }
    }
  }
}

function vehicleMatchesAlert(vehicle: any, alert: any): boolean {
  const f = alert.filters || {};

  if (f.make && vehicle.make?.toLowerCase() !== f.make.toLowerCase())
    return false;
  if (f.model && !vehicle.model?.toLowerCase().includes(f.model.toLowerCase()))
    return false;
  if (f.year_min && vehicle.year < f.year_min) return false;
  if (f.year_max && vehicle.year > f.year_max) return false;

  // asking_price -> ask_price
  if (f.max_price && vehicle.ask_price > f.max_price) return false;

  // odometer -> mileage
  if (f.max_odometer && vehicle.mileage > f.max_odometer) return false;

  // NEVER alert on a deal the engine rejected — a PASS verdict or an implausible/teaser price means
  // it's not a real, positive opportunity. Sending it would be inaccurate (the whole moat is trust).
  if (vehicle.deal_verdict === "pass") return false;
  if (vehicle.deal_analysis?.priceImplausible) return false;

  // Profit threshold against the ACCURATE net profit (after transport/recon/fees + condition), not
  // the crude generated profit_estimate (mmr − ask). Fall back only when the engine hasn't run.
  const netProfit =
    vehicle.true_net_profit != null
      ? Number(vehicle.true_net_profit)
      : Number(vehicle.profit_estimate || 0);
  if (f.min_profit && netProfit < f.min_profit) return false;

  // states -> target_states
  if (f.states?.length && !f.states.includes(vehicle.location_state))
    return false;

  return true;
}
