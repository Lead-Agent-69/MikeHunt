"use client";

import { useEffect, useState } from "react";

// The "Install app" nudge — the thing that turns a website into a home-screen app people keep open.
// Android/Chrome fire `beforeinstallprompt` (we capture it + offer a one-tap Install); iOS never does, so
// we show the manual "Share → Add to Home Screen" hint. Dismissible + remembered, and never shown once
// already installed (standalone display-mode).

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return; // already installed
    if (localStorage.getItem("installDismissed")) return;

    const ios =
      /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
      !(window.navigator as { standalone?: boolean }).standalone;
    setIsIOS(ios);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    let t: ReturnType<typeof setTimeout> | undefined;
    if (ios) t = setTimeout(() => setShow(true), 5000); // iOS: show the manual hint after a beat

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (t) clearTimeout(t);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  };

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("installDismissed", "1");
    } catch {
      /* private mode */
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 md:left-auto md:right-4 md:bottom-4 md:max-w-sm md:px-0 md:pb-4">
      <div
        className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 shadow-2xl backdrop-blur-xl"
        style={{ background: "rgba(15,15,20,0.92)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192x192.png"
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white">
            Install DealerHunt
          </div>
          <div className="truncate text-xs text-white/60">
            {isIOS
              ? "Tap ‘Share’ then ‘Add to Home Screen’"
              : "One tap — deals on your home screen"}
          </div>
        </div>
        {!isIOS && deferred && (
          <button
            onClick={install}
            className="shrink-0 rounded-full px-4 py-2 text-sm font-black text-white"
            style={{ background: "var(--grad, #f25b9a)" }}
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 grid h-8 w-8 place-items-center rounded-full text-white/50 hover:text-white/80"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
