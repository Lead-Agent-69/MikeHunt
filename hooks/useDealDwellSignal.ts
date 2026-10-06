"use client";

import { useEffect } from "react";
import { sendDealSignal } from "@/lib/reco/client";
import { UUID_RE } from "@/lib/reco/signals";

/** The backend gives dwell no weight under 5s (docs/RECOMMENDATIONS.md), so shorter views aren't sent. */
export const DWELL_SIGNAL_MIN_MS = 5_000;
/** /api/reco/signal accepts dwellMs up to one hour. */
export const DWELL_SIGNAL_MAX_MS = 3_600_000;

/**
 * Sends one "dwell" signal per deal view: the time the page was actually visible, sent when the
 * tab is hidden, the page is left, or the user navigates to another route. Only for a signed-in
 * viewer of a loaded deal. Best-effort through lib/reco/client: a failed beacon is silent.
 */
export function useDealDwellSignal(
  dealId: string | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !dealId || !UUID_RE.test(dealId)) return;
    if (typeof document === "undefined") return;

    let visibleMs = 0;
    let visibleSince: number | null =
      document.visibilityState === "visible" ? performance.now() : null;
    let sent = false;

    const pause = () => {
      if (visibleSince != null) {
        visibleMs += performance.now() - visibleSince;
        visibleSince = null;
      }
    };
    const flush = () => {
      pause();
      if (sent || visibleMs < DWELL_SIGNAL_MIN_MS) return;
      sent = true;
      sendDealSignal({
        dealId,
        kind: "dwell",
        dwellMs: Math.min(Math.round(visibleMs), DWELL_SIGNAL_MAX_MS),
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else if (visibleSince == null) visibleSince = performance.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [dealId, enabled]);
}
