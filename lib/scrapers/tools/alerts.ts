// lib/scrapers/tools/alerts.ts
// Alert service for price drops and scraper failures.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface AlertServiceOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  resendApiKey?: string;
  fromEmail?: string;
  appUrl?: string;
}

export interface PriceDropAlert {
  id: string;
  userId: string;
  dealId: string;
  oldPrice: number;
  newPrice: number;
  dropAmount: number;
  dropPercentage: number;
  dealTitle?: string;
}

export class ScraperAlertService {
  private supabase: SupabaseClient;
  private options: AlertServiceOptions;

  constructor(options: AlertServiceOptions = {}) {
    const supabaseUrl =
      options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase URL and key are required for ScraperAlertService",
      );
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.options = {
      fromEmail: "alerts@dealerhunt.com",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      ...options,
    };
  }

  // Find price drops from alert_log that haven't been sent yet
  async getPendingPriceDropAlerts(): Promise<PriceDropAlert[]> {
    const { data, error } = await this.supabase
      .from("alert_log")
      .select(
        "id, user_id, deal_id, old_price, new_price, drop_amount, drop_percentage, deals(title, year, make, model)",
      )
      .is("sent_at", null)
      .eq("alert_type", "price_drop");

    if (error) {
      console.error(
        "[AlertService] Failed to load pending alerts:",
        error.message,
      );
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      dealId: row.deal_id,
      oldPrice: row.old_price,
      newPrice: row.new_price,
      dropAmount: row.drop_amount,
      dropPercentage: row.drop_percentage,
      dealTitle:
        row.deals?.title ||
        `${row.deals?.year} ${row.deals?.make} ${row.deals?.model}`,
    }));
  }

  // Record that an alert was sent (or attempted)
  async markAlertSent(alertId: string): Promise<void> {
    const { error } = await this.supabase
      .from("alert_log")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", alertId);

    if (error) {
      console.error("[AlertService] Failed to mark alert sent:", error.message);
    }
  }

  // Send email for a price drop if Resend is configured
  async sendPriceDropEmail(alert: PriceDropAlert): Promise<boolean> {
    if (!this.options.resendApiKey) {
      console.warn(
        "[AlertService] No Resend API key configured, skipping email",
      );
      return false;
    }

    const { Resend } = await import("resend");
    const resend = new Resend(this.options.resendApiKey);

    // Email lives in Supabase auth.users (the real source) — NOT the legacy `profiles` table, which
    // only exists for the dead custom-auth path. Real users sign up via Supabase Auth and have no
    // `profiles` row, so the old lookup silently dropped every alert. Use the admin API like the pipeline.
    const { data: authData } = await this.supabase.auth.admin.getUserById(
      alert.userId,
    );
    const email = authData?.user?.email;
    if (!email) {
      console.warn(`[AlertService] No email for user ${alert.userId}`);
      return false;
    }

    try {
      await resend.emails.send({
        from: this.options.fromEmail!,
        to: email,
        subject: `Price Drop Alert: ${alert.dealTitle}`,
        html: `
          <h2>Price Drop Alert</h2>
          <p>A vehicle you are watching just dropped in price.</p>
          <div style="border: 1px solid #ddd; padding: 20px; margin: 20px 0;">
            <h3>${alert.dealTitle}</h3>
            <p><strong>Old Price:</strong> $${alert.oldPrice.toLocaleString()}</p>
            <p><strong>New Price:</strong> $${alert.newPrice.toLocaleString()}</p>
            <p><strong>Drop:</strong> $${alert.dropAmount.toLocaleString()} (${alert.dropPercentage.toFixed(1)}%)</p>
            <a href="${this.options.appUrl}/deals/${alert.dealId}" style="background: #F5A623; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Deal</a>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error("[AlertService] Failed to send email:", error);
      return false;
    }
  }

  // Main processing loop
  async processAlerts(): Promise<{ processed: number; emailsSent: number }> {
    const alerts = await this.getPendingPriceDropAlerts();
    let emailsSent = 0;

    // Honor the per-user "email me on price drops" setting (user_profiles.notify_price_drops). Default ON
    // when unset. Opted-out users' alerts are still marked sent (they stay in the in-app inbox) but no email.
    const userIds = Array.from(
      new Set(alerts.map((a) => a.userId).filter(Boolean)),
    );
    const optedOut = new Set<string>();
    if (userIds.length) {
      const { data } = await this.supabase
        .from("user_profiles")
        .select("user_id, notify_price_drops")
        .in("user_id", userIds);
      for (const p of (data || []) as {
        user_id: string;
        notify_price_drops: boolean | null;
      }[]) {
        if (p.notify_price_drops === false) optedOut.add(p.user_id);
      }
    }

    for (const alert of alerts) {
      if (!optedOut.has(alert.userId)) {
        const sent = await this.sendPriceDropEmail(alert);
        if (sent) emailsSent += 1;
      }
      await this.markAlertSent(alert.id);
    }

    return { processed: alerts.length, emailsSent };
  }
}
