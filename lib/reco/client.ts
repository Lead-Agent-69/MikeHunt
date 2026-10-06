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

// Readers for the reco GET endpoints. Components used to inline these fetches; keep the
// fire-and-forget sendDealSignal above, and use these when the UI needs a typed response.
// Any error (401 guest, 5xx, network) resolves to null so callers can hide the UI quietly.

export interface SimilarPrompt {
  facet: string;
  label?: string;
  message: string;
  basedOnListings?: number;
}

export interface SimilarPromptResponse {
  prompt: SimilarPrompt | null;
  /** false when deal_signals is missing or Supabase is not configured. */
  signalsAvailable?: boolean;
}

export async function fetchSimilarPrompt(): Promise<SimilarPromptResponse | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/reco/prompt", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SimilarPromptResponse;
  } catch {
    return null;
  }
}

export interface ForYouApiResponse {
  items?: Array<Record<string, unknown>>;
  personalized?: boolean;
  /** false when deal_signals is missing; true for cold start (table exists, no signals yet). */
  signalsAvailable?: boolean;
  basedOnSignals?: number;
  configured?: boolean;
  homeState?: string | null;
  deskAccess?: string;
}

export async function fetchForYou(
  limit = 12,
): Promise<ForYouApiResponse | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(
      `/api/reco/for-you?limit=${Math.max(1, Math.min(48, limit))}`,
      {
        credentials: "same-origin",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ForYouApiResponse;
  } catch {
    return null;
  }
}
