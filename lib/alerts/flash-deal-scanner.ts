import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "../notifications/email";
import { sendSMS } from "../notifications/sms";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Define exactly what qualifies as a Flash Deal
const FLASH_DEAL_PROFIT_THRESHOLD = 90;

export async function scanForFlashDeals() {
  console.log("[FlashDealScanner] Scanning for new flash deals...");

  // Query un-alerted deals that meet the criteria
  const { data: flashDeals, error } = await supabase
    .from("deals")
    .select(
      `
      id, title, year, make, model, ask_price, profit_estimate, profit_score, 
      sell_estimate, source_url, location_city, location_state, 
      estimated_repair_cost, estimated_transport_cost, true_net_profit, 
      deal_analysis, created_at
    `,
    )
    .eq("deal_verdict", "go")
    .eq("flash_alert_sent", false)
    .gte("profit_score", FLASH_DEAL_PROFIT_THRESHOLD)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[FlashDealScanner] Error querying deals:", error);
    return 0;
  }

  if (!flashDeals || flashDeals.length === 0) {
    console.log("[FlashDealScanner] No new flash deals found.");
    return 0;
  }

  console.log(
    `[FlashDealScanner] Found ${flashDeals.length} new flash deals. Dispatching alerts...`,
  );

  // We need to mark them as alerted immediately to prevent race conditions or duplicate alerts
  const dealIds = flashDeals.map((d) => d.id);
  const { error: updateError } = await supabase
    .from("deals")
    .update({ flash_alert_sent: true })
    .in("id", dealIds);

  if (updateError) {
    console.error(
      "[FlashDealScanner] Failed to update flash_alert_sent flag:",
      updateError,
    );
    // Continue anyway to ensure we send the alerts, but this might result in duplicates next run
  }

  // Get admin user(s) to notify.
  // For now, we will query the profiles table for any admin users or users opted into flash alerts.
  // We'll just notify everyone or you can hardcode an email/phone number.
  // Since we don't have a dedicated flash deal opt-in yet, let's just alert the system owner or
  // log it prominently if no active notification channels are configured.

  for (const deal of flashDeals) {
    const profitStr =
      deal.true_net_profit > 0
        ? `$${deal.true_net_profit.toLocaleString()}`
        : `$${deal.profit_estimate?.toLocaleString()}`;
    const message = `⚡ FLASH DEAL: ${deal.year} ${deal.make} ${deal.model} for $${deal.ask_price.toLocaleString()} in ${deal.location_city}, ${deal.location_state}. Est Profit: ${profitStr}. Score: ${deal.profit_score}. Act fast: ${deal.source_url}`;

    // Note: In a production scenario with many users, you would join against public.alerts
    // or a user preferences table. Assuming single admin/owner context here.

    try {
      // If the environment has a designated admin phone/email, we can send to it.
      // E.g., process.env.ADMIN_PHONE
      if (process.env.ADMIN_PHONE) {
        await sendSMS({ to: process.env.ADMIN_PHONE, message: message });
      } else {
        console.log(
          "[FlashDealScanner] Twilio / Admin Phone not configured. Message:",
          message,
        );
      }

      if (process.env.ADMIN_EMAIL) {
        await sendEmail({
          to: process.env.ADMIN_EMAIL,
          subject: "⚡ Flash Deal Alert",
          html: `<p>${message}</p>`,
        });
      }
    } catch (deliveryError) {
      console.error(
        `[FlashDealScanner] Delivery failed for deal ${deal.id}:`,
        deliveryError,
      );
    }
  }

  return flashDeals.length;
}
