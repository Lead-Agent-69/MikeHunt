"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/vapid";
import { fetcher } from "@/lib/swr-config";
import { useDealerId } from "@/hooks/useDealerId";

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
  const { dealerId, loading: authLoading, error: authError } = useDealerId();
  const owner = useRef(dealerId);
  const ownershipCheck = useRef(0);
  const mounted = useRef(true);
  owner.current = dealerId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const checkOwner = (id: string | null) => {
    if (!mounted.current || !id || owner.current !== id)
      throw new Error("Account changed.");
  };
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const {
    data: readiness,
    error: readinessError,
    isLoading: checking,
    isValidating,
    mutate: retryStatus,
  } = useSWR<{ configured: boolean }>(
    support === "supported" ? "/api/push/status" : null,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 1, dedupingInterval: 60_000 },
  );

  useEffect(() => {
    const check = ++ownershipCheck.current;
    const controller = new AbortController();
    setEnabled(false);
    setBusy(false);
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
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (
          !sub ||
          authLoading ||
          authError ||
          Notification.permission !== "granted"
        )
          return;
        if (!dealerId) {
          if (!cancelled && check === ownershipCheck.current)
            await sub.unsubscribe();
          return;
        }
        const response = await fetch("/api/push/subscribe", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data.endpoints)) return;
        if (!data.endpoints.includes(sub.endpoint)) {
          if (!cancelled && check === ownershipCheck.current)
            await sub.unsubscribe();
          return;
        }
        if (!cancelled && check === ownershipCheck.current)
          setEnabled(
            Array.isArray(data.endpoints) &&
              data.endpoints.includes(sub.endpoint),
          );
      })
      .catch(() => undefined);
    const detached = () => {
      ownershipCheck.current++;
      setEnabled(false);
    };
    window.addEventListener("mikehunt:push-detached", detached);
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("mikehunt:push-detached", detached);
    };
  }, [dealerId, authLoading, authError]);

  const enable = async () => {
    const id = dealerId;
    ownershipCheck.current++;
    setBusy(true);
    try {
      checkOwner(id);
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error(
          "Notifications are blocked. Allow them in your browser settings.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      checkOwner(id);
      if (sub && !enabled) {
        if (!(await sub.unsubscribe())) throw new Error();
        sub = null;
      }
      checkOwner(id);
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
        body: JSON.stringify({ ...sub.toJSON(), expectedUserId: id }),
      });
      if (!res.ok) throw new Error();
      checkOwner(id);
      setEnabled(true);
      toast.success(
        "Alerts are on for this device. Send a test to check one arrives.",
      );
    } catch {
      if (mounted.current && owner.current === id)
        toast.error("Couldn’t turn on notifications for this device.");
    } finally {
      if (mounted.current && owner.current === id) setBusy(false);
    }
  };

  const disable = async () => {
    const id = dealerId;
    ownershipCheck.current++;
    setBusy(true);
    try {
      checkOwner(id);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      checkOwner(id);
      if (sub) {
        const res = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, expectedUserId: id }),
        });
        if (!res.ok) throw new Error();
        checkOwner(id);
        if (!(await sub.unsubscribe())) throw new Error();
        checkOwner(id);
      }
      setEnabled(false);
      toast.success("Alerts are off for this device.");
    } catch {
      if (mounted.current && owner.current === id)
        toast.error("Could not turn off alerts. Try again.");
    } finally {
      if (mounted.current && owner.current === id) setBusy(false);
    }
  };

  const sendTest = async () => {
    const id = dealerId;
    setBusy(true);
    try {
      checkOwner(id);
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUserId: id }),
      });
      const j = (await res.json().catch(() => ({}))) as { sent?: number };
      checkOwner(id);
      if (res.ok && (j.sent ?? 0) > 0)
        toast.success("Test sent to your subscribed devices.");
      else if (res.status === 429)
        toast.error("Too many tests. Try again in a minute.");
      else toast.error("No test was sent. Try turning alerts off and on.");
    } catch {
      if (mounted.current && owner.current === id)
        toast.error("Couldn’t send a test right now.");
    } finally {
      if (mounted.current && owner.current === id) setBusy(false);
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

  if (checking && !readiness && !enabled)
    return <p className={noteClass}>Checking push alerts...</p>;

  const statusNotice =
    readinessError || typeof readiness?.configured !== "boolean" ? (
      <div className="flex max-w-xs items-center gap-2">
        <p className={noteClass}>Could not check push alerts.</p>
        <button
          type="button"
          aria-label="Retry push status"
          title="Retry push status"
          disabled={isValidating}
          onClick={() => {
            void retryStatus();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-60"
        >
          <RotateCw size={18} aria-hidden="true" />
        </button>
      </div>
    ) : !readiness.configured ? (
      <p className={noteClass}>
        Push alerts aren’t switched on for MikeHunt yet.
      </p>
    ) : null;
  if (statusNotice && !enabled) return statusNotice;
  const canSend = readiness?.configured === true && !readinessError;

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
      {enabled && canSend && (
        <button
          type="button"
          onClick={sendTest}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)] disabled:opacity-60"
        >
          Send test
        </button>
      )}
      {statusNotice}
    </div>
  );
}
