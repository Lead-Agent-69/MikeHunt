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
// Optional prompts fail quietly; For You exposes service failures for a retry state.

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
  eligibleIds?: string[],
): Promise<ForYouApiResponse | null> {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams({
    limit: String(
      Number.isFinite(limit)
        ? Math.max(1, Math.min(48, Math.floor(limit)))
        : 12,
    ),
  });
  if (eligibleIds)
    params.set("ids", Array.from(new Set(eligibleIds)).slice(0, 120).join(","));
  const res = await fetch(`/api/reco/for-you?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Recommendations are temporarily unavailable");
  return (await res.json()) as ForYouApiResponse;
}
