"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// The "Install app" nudge. Android/desktop Chromium fire `beforeinstallprompt` (we capture it and offer a
// one-tap Install); iOS/iPadOS Safari never does, so we show the manual "Share → Add to Home Screen" hint.
//
// Rules: dismissible and remembered (localStorage), never shown once installed (standalone display-mode or
// the `appinstalled` event), never on sign-in / onboarding screens, and it waits a beat so it never greets a
// first paint. It is a small floating card: the full-width wrapper is pointer-events-none so it never
// swallows taps on the page underneath.

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const INSTALL_DISMISSED_KEY = "installDismissed";
export const INSTALL_DONE_KEY = "installDone";
/** Delay before the nudge appears, so it never covers the first screen a visitor sees. */
export const INSTALL_PROMPT_DELAY_MS = 8000;

/** Screens where an install nudge would get in the way of a task (auth, onboarding). */
const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/onboarding",
  "/welcome",
];

export function isInstallPromptHiddenPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** iPhone/iPod, plus iPadOS 13+ which reports itself as a Mac with touch. */
export function isIOSDevice(nav: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  if (/iphone|ipad|ipod/i.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

function readFlag(key: string): boolean {
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* private mode: the nudge just comes back next visit */
  }
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return; // already installed
    if (readFlag(INSTALL_DISMISSED_KEY) || readFlag(INSTALL_DONE_KEY)) return;

    const ios = isIOSDevice(window.navigator);
    setIsIOS(ios);

    let t: ReturnType<typeof setTimeout> | undefined;
    const reveal = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setShow(true), INSTALL_PROMPT_DELAY_MS);
    };

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      reveal();
    };
    const onInstalled = () => {
      writeFlag(INSTALL_DONE_KEY);
      setDeferred(null);
      setShow(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (ios) reveal(); // iOS has no install event; show the manual hint after a beat

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      // A "not now" in the browser's own dialog counts as a dismissal; don't ask again.
      writeFlag(
        choice.outcome === "accepted"
          ? INSTALL_DONE_KEY
          : INSTALL_DISMISSED_KEY,
      );
    } catch {
      /* prompt() can only be used once; fall through and hide */
    }
    setDeferred(null);
    setShow(false);
  };

  const dismiss = () => {
    setShow(false);
    writeFlag(INSTALL_DISMISSED_KEY);
  };

  if (!show || isInstallPromptHiddenPath(pathname)) return null;
  // Chromium without a captured event can't install from here; only iOS gets the manual hint.
  if (!isIOS && !deferred) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[60] px-3 pb-2 pt-2 md:left-auto md:right-4 md:bottom-4 md:max-w-sm md:px-0 md:pb-4">
      <section
        aria-label="Install MikeHunt"
        className="pointer-events-auto flex items-center gap-3 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] p-3 shadow-[var(--shadow)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192x192.png"
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-[var(--t1)]">
            Install MikeHunt
          </div>
          <div className="text-xs text-[var(--t2)]">
            {isIOS
              ? "Tap Share, then “Add to Home Screen”."
              : "Open it from your home screen like an app."}
          </div>
        </div>
        {!isIOS && deferred && (
          <button
            type="button"
            onClick={install}
            className="min-h-11 shrink-0 rounded-full bg-[var(--accent)] px-4 text-sm font-black text-white"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install suggestion"
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-[var(--t3)] hover:text-[var(--t1)]"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </section>
    </div>
  );
}
