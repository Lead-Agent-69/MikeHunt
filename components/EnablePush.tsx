"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/vapid";

// "Enable deal alerts" for this device: asks for notification permission, subscribes to Web Push and saves
// the subscription. Honest by construction:
// - it asks /api/push/status first and says so plainly when the server can't send push yet;
// - on iPhone/iPad outside the installed app it explains push needs Add to Home Screen (iOS 16.4+);
// - once on, "Send test" proves a notification really arrives and opens the app.

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushSupport = "supported" | "ios-needs-install" | "unsupported";

export function pushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  standalone: boolean;
}): PushSupport {
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification)
    return "supported";
  // iOS only exposes Web Push to a Home Screen web app.
  if (env.isIOS && !env.standalone) return "ios-needs-install";
  return "unsupported";
}

const noteClass = "max-w-xs text-[12px] text-[var(--t3)]";

export function EnablePush({ className }: { className?: string }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const s = pushSupport({
      hasServiceWorker: "serviceWorker" in nav,
      hasPushManager: "PushManager" in window,
      hasNotification: "Notification" in window,
      isIOS:
        /iphone|ipad|ipod/i.test(nav.userAgent) ||
        (nav.platform === "MacIntel" && nav.maxTouchPoints > 1),
      standalone:
        window.matchMedia?.("(display-mode: standalone)").matches ||
        nav.standalone === true,
    });
    setSupport(s);
    if (s !== "supported") return;

    let cancelled = false;
    fetch("/api/push/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((j: { configured?: boolean }) => {
        if (!cancelled) setServerReady(j.configured === true);
      })
      .catch(() => {
        if (!cancelled) setServerReady(false);
      });
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled)
          setEnabled(!!sub && Notification.permission === "granted");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error(
          "Notifications are blocked. Allow them in your browser settings.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // TS 5.x types Uint8Array generically, which trips the BufferSource check; the value is valid.
          applicationServerKey: urlB64ToUint8Array(
            VAPID_PUBLIC_KEY,
          ) as BufferSource,
        });
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error();
      setEnabled(true);
      toast.success(
        "Alerts are on for this device. Send a test to check one arrives.",
      );
    } catch {
      toast.error("Couldn’t turn on notifications for this device.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Alerts are off for this device.");
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { sent?: number };
      if (res.ok && (j.sent ?? 0) > 0)
        toast.success("Test sent. It should arrive in a few seconds.");
      else if (res.status === 429)
        toast.error("Too many tests. Try again in a minute.");
      else
        toast.error(
          "The test didn’t reach this device. Try turning alerts off and on.",
        );
    } catch {
      toast.error("Couldn’t send a test right now.");
    } finally {
      setBusy(false);
    }
  };

  if (support === null || support === "unsupported") return null;

  if (support === "ios-needs-install")
    return (
      <p className={noteClass}>
        On iPhone and iPad, deal alerts work once MikeHunt is on your Home
        Screen: tap Share, then “Add to Home Screen”, and open it from there.
      </p>
    );

  if (serverReady === null) return null;

  if (!serverReady)
    return (
      <p className={noteClass}>
        Push alerts aren’t switched on for MikeHunt yet. Email alerts still
        work.
      </p>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={enabled ? disable : enable}
        disabled={busy}
        aria-pressed={enabled}
        className={
          className ||
          "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-white disabled:opacity-60"
        }
        style={
          className
            ? undefined
            : {
                background: enabled ? "var(--s2)" : "var(--grad, #075BE8)",
                color: enabled ? "var(--t1)" : undefined,
              }
        }
      >
        {busy ? "…" : enabled ? "Alerts on (turn off)" : "Enable deal alerts"}
      </button>
      {enabled && (
        <button
          type="button"
          onClick={sendTest}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)] disabled:opacity-60"
        >
          Send test
        </button>
      )}
    </div>
  );
}
