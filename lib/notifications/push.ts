import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PUBLIC_KEY } from "./vapid";

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
      process.env.VAPID_SUBJECT || "mailto:alerts@dealerhunt.app",
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
}

/** Send a push to all of a user's subscribed devices. Returns how many delivered. No-op without a key. */
export async function sendPushToUser(
  sb: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!(await ensureConfigured(sb))) return 0;

  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (e: any) {
        // Subscription expired/gone → clean it up so we don't keep trying.
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );
  return sent;
}
