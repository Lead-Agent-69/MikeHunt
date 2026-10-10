"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// The "Install app" nudge. Android/desktop Chromium fire `beforeinstallprompt` (we capture it and offer a
// one-tap Install); iOS/iPadOS Safari never does, so we show the "Share → Add to Home Screen" text instead
// of a dead button.
//
// Rules (Sara's UX checklist):
// - Never on the first visit: only from the 2nd browser session, or right after a save/alert action
//   (callers fire `markInstallEngagement()`).
// - Never over the verdict or the primary action: hidden on deal, swipe and deal-check screens, plus
//   sign-in and onboarding.
// - Dismissable with a visible 44px ✕ labelled "Dismiss" and with Escape; remembered for 30 days.
//   Hidden for good once installed (standalone display-mode or `appinstalled`).
// - A non-modal `role="region"` banner: no focus stealing. The full-width wrapper is pointer-events-none
//   so only the card takes taps.

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const INSTALL_DISMISSED_KEY = "installDismissed";
export const INSTALL_DONE_KEY = "installDone";
export const INSTALL_SESSIONS_KEY = "installSessions";
export const INSTALL_ENGAGED_EVENT = "mikehunt:install-engaged";
const SESSION_SEEN_KEY = "installSessionCounted";
export const INSTALL_DISMISS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Screens where an install banner would sit over a decision, the primary action, or a task. */
const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/onboarding",
  "/welcome",
  "/deal",
  "/deal-check",
  "/swipe",
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

/** A dismissal counts for 30 days. Legacy "1" values (pre-timestamp) count as dismissed now. */
export function isDismissalActive(
  value: string | null,
  now: number = Date.now(),
): boolean {
  if (!value) return false;
  const at = Number(value);
  if (!Number.isFinite(at) || at < 1e12) return true;
  return now - at < INSTALL_DISMISS_DAYS * DAY_MS;
}

/** Eligible from the 2nd session, or once the user saved something / set an alert. */
export function isEngagedEnough(sessions: number, engaged: boolean): boolean {
  return engaged || sessions >= 2;
}

/** Call after a save or alert action so the install banner may appear on this visit. */
export function markInstallEngagement() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INSTALL_ENGAGED_EVENT));
}

function read(key: string, store: "local" | "session" = "local") {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(
  key: string,
  value: string,
  store: "local" | "session" = "local",
) {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* private mode: the banner just stays hidden-by-default (session count never grows) */
  }
}

/** Count this browser session once; returns the total sessions seen. */
function countSession(): number {
  const prior = Number(read(INSTALL_SESSIONS_KEY)) || 0;
  if (read(SESSION_SEEN_KEY, "session")) return prior;
  write(SESSION_SEEN_KEY, "1", "session");
  write(INSTALL_SESSIONS_KEY, String(prior + 1));
  return prior + 1;
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone || read(INSTALL_DONE_KEY)) return; // already installed
    if (isDismissalActive(read(INSTALL_DISMISSED_KEY))) return;
    setClosed(false);

    setIsIOS(isIOSDevice(window.navigator));
    setEligible(isEngagedEnough(countSession(), false));

    const onEngaged = () => setEligible(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      write(INSTALL_DONE_KEY, String(Date.now()));
      setDeferred(null);
      setClosed(true);
    };
    window.addEventListener(INSTALL_ENGAGED_EVENT, onEngaged);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(INSTALL_ENGAGED_EVENT, onEngaged);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const visible =
    !closed &&
    eligible &&
    !isInstallPromptHiddenPath(pathname) &&
    // Chromium without a captured event can't install from here; only iOS gets the manual hint.
    (isIOS || !!deferred);

  const dismiss = () => {
    setClosed(true);
    write(INSTALL_DISMISSED_KEY, String(Date.now()));
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      // A "not now" in the browser's own dialog counts as a dismissal.
      if (choice.outcome === "accepted")
        write(INSTALL_DONE_KEY, String(Date.now()));
      else write(INSTALL_DISMISSED_KEY, String(Date.now()));
    } catch {
      /* prompt() can only be used once; fall through and hide */
    }
    setDeferred(null);
    setClosed(true);
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[60] px-3 pb-2 pt-2 md:left-auto md:right-4 md:bottom-4 md:max-w-sm md:px-0 md:pb-4">
      <div
        role="region"
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
          aria-label="Dismiss"
          className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-[var(--t3)] hover:text-[var(--t1)]"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
