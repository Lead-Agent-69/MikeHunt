/**
 * Pure roll-up of alert_deliveries rows for the admin view. Client-safe.
 *
 * Which stages each channel can actually observe (so the view never implies more than we track):
 *  - email: sent (Resend accepted), delivered (Resend webhook), opened (pixel or Resend webhook,
 *           approximate: image blocking hides opens and privacy proxies prefetch them), clicked.
 *  - push:  sent (push service accepted), delivered (service-worker receipt), clicked. No "opened".
 *  - sms:   sent (Twilio accepted), clicked. Delivery needs a Twilio status callback (not wired).
 */
export type Channel = "email" | "push" | "sms";
export type Stage = "sent" | "delivered" | "opened" | "clicked";

export const TRACKED_STAGES: Record<Channel, readonly Stage[]> = {
  email: ["sent", "delivered", "opened", "clicked"],
  push: ["sent", "delivered", "clicked"],
  sms: ["sent", "clicked"],
};

export type DeliveryRow = {
  channel: string;
  kind?: string | null;
  status?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  failed_at?: string | null;
};

export type ChannelSummary = {
  channel: Channel;
  total: number;
  failed: number;
  stages: Partial<Record<Stage, number>>;
  /** Share of sent that reached each later stage (0..1), only for tracked stages. */
  rates: Partial<Record<Stage, number>>;
};

const CHANNELS: Channel[] = ["email", "push", "sms"];

export function summarizeDeliveries(
  rows: readonly DeliveryRow[],
): ChannelSummary[] {
  return CHANNELS.map((channel) => {
    const mine = rows.filter((r) => r.channel === channel);
    const stages: Partial<Record<Stage, number>> = {};
    for (const stage of TRACKED_STAGES[channel]) {
      stages[stage] = mine.filter((r) =>
        Boolean(r[`${stage}_at` as const]),
      ).length;
    }
    const sent = stages.sent ?? 0;
    const rates: Partial<Record<Stage, number>> = {};
    for (const stage of TRACKED_STAGES[channel]) {
      if (stage === "sent") continue;
      rates[stage] = sent > 0 ? (stages[stage] ?? 0) / sent : 0;
    }
    return {
      channel,
      total: mine.length,
      failed: mine.filter(
        (r) =>
          r.status === "failed" ||
          r.status === "bounced" ||
          Boolean(r.failed_at),
      ).length,
      stages,
      rates,
    };
  });
}
