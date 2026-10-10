import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY } from "./vapid";
import {
  createDelivery,
  markDeliverySent,
  type DeliveryKind,
} from "@/lib/alerts/delivery-tracking";

// Server-side Web Push. Sends a notification to every device a user has subscribed. Gracefully NO-OPS if the
// private key isn't available anywhere (so the app never crashes for lack of a secret — push just stays off).
// Dead subscriptions (410/404) are pruned automatically.

// The private key resolves from the env var FIRST (standard), then falls back to the locked app_secrets table
// (service-role only) so push works with zero env config. Resolved once per process, then cached.
let configured: boolean | null = null;
async function ensureConfigured(sb: SupabaseClient): Promise<boolean> {
  if (configured !== null) return configured;
  let priv = process.env.VAPID_PRIVATE_KEY || "";
  if (!priv) {
    try {
      const { data } = await sb
        .from("app_secrets")
        .select("value")
        .eq("key", "vapid_private_key")
        .maybeSingle();
      priv = (data as { value?: string } | null)?.value || "";
    } catch {
      /* table missing / no access → push stays off */
    }
  }
  if (!priv) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:alerts@MikeHunt.app",
      VAPID_PUBLIC_KEY,
      priv,
    );
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // where notificationclick should open
  tag?: string; // collapse key (e.g. dedupe by deal id)
  /** Opaque delivery id; the service worker posts a receipt to /api/t/d/<id> when it arrives. */
  deliveryId?: string;
}

/** Optional delivery tracking: one alert_deliveries row per device. */
export interface PushTracking {
  kind: DeliveryKind;
  dealId?: string | null;
  searchId?: string | null;
}

/** Send a push to all of a user's subscribed devices. Returns how many delivered. No-op without a key. */
export async function sendPushToUser(
  sb: SupabaseClient,
  userId: string,
  payload: PushPayload,
  track?: PushTracking,
): Promise<number> {
  if (!(await ensureConfigured(sb))) return 0;

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return 0;

  let sent = 0;
  await Promise.all(
    subs.map(async (s: any) => {
      // Per-device tracking row. With tracking, the click goes through /api/t/c/<id>, which
      // redirects to the deal page resolved server-side (same origin, relative URL).
      const deliveryId = track
        ? await createDelivery(sb, {
            userId,
            kind: track.kind,
            channel: "push",
            dealId: track.dealId,
            searchId: track.searchId,
          })
        : null;
      const body = JSON.stringify(
        deliveryId
          ? { ...payload, url: `/api/t/c/${deliveryId}`, deliveryId }
          : payload,
      );
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
        await markDeliverySent(sb, deliveryId, { ok: true });
      } catch (e: any) {
        await markDeliverySent(sb, deliveryId, {
          ok: false,
          error: e?.statusCode ? `push ${e.statusCode}` : "push failed",
        });
        // Subscription expired/gone → clean it up so we don't keep trying.
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );
  return sent;
}
