"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/vapid";

// One-tap "Enable deal alerts" — requests notification permission, subscribes this device to Web Push, and
// saves the subscription. This is the retention engine's front door: turn it on once, get pinged when a hot
// deal matching your taste drops. Renders nothing on unsupported browsers.

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function EnablePush({ className }: { className?: string }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub && Notification.permission === "granted");
    });
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications blocked — enable them in your browser.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // TS 5.x types Uint8Array generically, which trips the BufferSource check — the value is valid.
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
      toast.success("🔔 Alerts on — we’ll ping you when a hot deal drops");
    } catch {
      toast.error("Couldn’t enable notifications");
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
      toast.success("Alerts off");
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <button
      onClick={enabled ? disable : enable}
      disabled={busy}
      className={
        className ||
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      }
      style={
        className
          ? undefined
          : { background: enabled ? "var(--s2)" : "var(--grad, #f25b9a)" }
      }
    >
      {busy ? "…" : enabled ? "🔔 Alerts on" : "🔔 Enable deal alerts"}
    </button>
  );
}
