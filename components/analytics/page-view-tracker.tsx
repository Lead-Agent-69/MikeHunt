"use client";

// components/analytics/page-view-tracker.tsx
//
// Emits one beacon per route navigation to POST /api/analytics/pageview, feeding the page_views
// table that answers "which of the overlapping deal feeds is anyone actually opening?" before we
// prune them (see STATUS.md -> Known follow-ups).
//
// Deliberate properties:
//   * FIRE AND FORGET — sendBeacon first (survives unload), fetch keepalive as fallback, and
//     errors are swallowed. Telemetry can never break the page it measures.
//   * NO user identity — aggregate counts only, so there is no auth roundtrip per view.
//   * Deduped per pathname — a re-render or effect re-run must not double-count.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const ENDPOINT = "/api/analytics/pageview";

function detectDevice(): "desktop" | "tablet" | "mobile" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

/** Paths that are assets or tooling — never a real user-facing route. */
function isTrackable(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("/_next")) return false;
  if (path.startsWith("/api/")) return false;
  // Static file extensions.
  if (/\.[a-z0-9]{2,5}(\?|$)/i.test(path)) return false;
  return true;
}

function sendBeacon(path: string, referrer: string | null): void {
  const payload = JSON.stringify({
    path,
    referrer,
    device: detectDevice(),
  });

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch {
    // fall through to fetch
  }

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      /* telemetry: ignore */
    });
  } catch {
    /* telemetry: ignore */
  }
}

export function PageViewTracker() {
  const pathname = usePathname();
  const lastSentRef = useRef<string | null>(null);

  // Only `pathname` is counted: pruning decisions are about ROUTES, so `/discover?source=copart`
  // and `/discover` are the same page. (Deliberately no useSearchParams — it would force a Suspense
  // boundary through the root layout, and query permutations are not what we are measuring.)
  useEffect(() => {
    if (!pathname || !isTrackable(pathname)) return;

    if (lastSentRef.current === pathname) return;
    lastSentRef.current = pathname;

    const referrer =
      typeof document !== "undefined" && document.referrer
        ? document.referrer.slice(0, 500)
        : null;

    sendBeacon(pathname, referrer);
  }, [pathname]);

  return null;
}
