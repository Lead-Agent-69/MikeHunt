// Client stub for view signals. Fire-and-forget: a failed beacon never breaks the page.
// Wiring (deal open, dwell on leave, save, dismiss, prompt answers) is UI work; this is the hook.
//
//   sendDealSignal({ dealId, kind: "open" })
//   sendDealSignal({ dealId, kind: "dwell", dwellMs: 42_000 })   // on pagehide / route change
//   sendDealSignal({ kind: "interest_yes", facet: prompt.facet })

export type DealSignalKind =
  | "open"
  | "dwell"
  | "save"
  | "unsave"
  | "dismiss"
  | "interest_yes"
  | "interest_no";

export interface DealSignalInput {
  dealId?: string;
  kind: DealSignalKind;
  dwellMs?: number;
  facet?: string;
}

export function sendDealSignal(input: DealSignalInput): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(input);
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        "/api/reco/signal",
        new Blob([body], { type: "application/json" }),
      );
      if (ok) return;
    }
    void fetch("/api/reco/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    /* never break the page */
  }
}
