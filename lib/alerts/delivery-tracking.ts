/**
 * Alert delivery tracking: sent / delivered / opened / clicked per channel.
 *
 * Every notification we send gets one `alert_deliveries` row per channel (and per device for push).
 * The row id is a random UUID and is the ONLY identifier that appears in tracking URLs:
 *   - open pixel     /api/t/o/<id>   (email only; 1x1 GIF)
 *   - click redirect /api/t/c/<id>   (email, SMS and push)
 *   - push receipt   /api/t/d/<id>   (service worker reports the push reached the device)
 * No email, phone number or user id is ever put in a URL.
 *
 * Click redirects never read a destination from the request. The target is resolved server-side
 * from the stored row: our own /deal/<deal_id>, or the deal's stored listing URL (http/https only).
 *
 * Everything here fails soft: if the table is missing (migration not applied) or a write errors,
 * the alert still sends exactly as before, just untracked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryKind = "saved_search_match" | "price_drop" | "alert_match";
export type DeliveryChannel = "email" | "sms" | "push";
export type DeliveryEvent = "delivered" | "opened" | "clicked";
export type ClickTarget = "deal" | "listing";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDeliveryId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Absolute base for links in email/SMS. Push links stay relative (same origin as the app). */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
}

export function trackingUrls(deliveryId: string, base: string = appBaseUrl()) {
  const id = encodeURIComponent(deliveryId);
  return {
    pixelUrl: `${base}/api/t/o/${id}`,
    clickUrl: `${base}/api/t/c/${id}`,
    receiptUrl: `${base}/api/t/d/${id}`,
  };
}

/** `<img>` tag for the open pixel. Empty alt so screen readers skip it. */
export function openPixelHtml(pixelUrl: string): string {
  return `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
}

/**
 * Where a click lands. Only two possible destinations, both derived from stored data:
 *  - "listing": the deal's stored source_url, if it is a plain http(s) URL.
 *  - otherwise our own deal page /deal/<deal_id> (a UUID), or /alerts when there is no deal.
 * Returned paths are same-origin (start with a single "/").
 */
export function resolveClickDestination(
  row: { click_target?: string | null; deal_id?: string | null } | null,
  listingUrl?: string | null,
): string {
  if (!row) return "/alerts";
  if (row.click_target === "listing" && listingUrl) {
    try {
      const u = new URL(listingUrl);
      if (u.protocol === "https:" || u.protocol === "http:")
        return u.toString();
    } catch {
      /* fall through to the deal page */
    }
  }
  if (isDeliveryId(row.deal_id)) return `/deal/${row.deal_id}`;
  return "/alerts";
}

export type NewDelivery = {
  userId: string;
  kind: DeliveryKind;
  channel: DeliveryChannel;
  dealId?: string | null;
  searchId?: string | null;
  clickTarget?: ClickTarget;
};

/** Create a queued delivery row. Returns its id, or null when tracking is unavailable. */
export async function createDelivery(
  sb: SupabaseClient,
  d: NewDelivery,
): Promise<string | null> {
  try {
    const { data, error } = await sb
      .from("alert_deliveries")
      .insert({
        user_id: d.userId,
        kind: d.kind,
        channel: d.channel,
        deal_id: isDeliveryId(d.dealId) ? d.dealId : null,
        search_id: isDeliveryId(d.searchId) ? d.searchId : null,
        click_target: d.clickTarget || "deal",
        status: "queued",
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** Record the provider's answer to a send attempt. */
export async function markDeliverySent(
  sb: SupabaseClient,
  id: string | null,
  result: {
    ok: boolean;
    providerMessageId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  if (!id) return;
  const now = new Date().toISOString();
  try {
    await sb
      .from("alert_deliveries")
      .update(
        result.ok
          ? {
              status: "sent",
              sent_at: now,
              provider_message_id: result.providerMessageId || null,
            }
          : {
              status: "failed",
              failed_at: now,
              error: String(result.error || "send failed").slice(0, 300),
            },
      )
      .eq("id", id);
  } catch {
    /* tracking is best-effort */
  }
}

/** delivered / opened / clicked, via the atomic SQL function. */
export async function recordDeliveryEvent(
  sb: SupabaseClient,
  id: string,
  event: DeliveryEvent,
): Promise<void> {
  if (!isDeliveryId(id)) return;
  try {
    await sb.rpc("alert_delivery_event", { p_id: id, p_event: event });
  } catch {
    /* best-effort */
  }
}

/** Same as recordDeliveryEvent, keyed by the provider's message id (Resend webhook). */
export async function recordProviderEvent(
  sb: SupabaseClient,
  providerMessageId: string,
  event: DeliveryEvent | "bounced",
): Promise<void> {
  if (!providerMessageId) return;
  try {
    const { data } = await sb
      .from("alert_deliveries")
      .select("id")
      .eq("provider_message_id", providerMessageId)
      .limit(5);
    for (const row of (data || []) as { id: string }[]) {
      if (event === "bounced") {
        await sb
          .from("alert_deliveries")
          .update({
            status: "bounced",
            failed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } else {
        await recordDeliveryEvent(sb, row.id, event);
      }
    }
  } catch {
    /* best-effort */
  }
}

/** 1x1 transparent GIF. */
export const PIXEL_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);
