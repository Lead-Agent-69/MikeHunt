// lib/scrapers/tools/escalation.ts
// Unified tiered anti-bot fetch — the redesign's single escalation path, replacing each source's
// ad-hoc proxy/FlareSolverr/browser logic. Tiers: direct → FlareSolverr (if configured). Browser is
// the caller's responsibility (it owns Playwright), signalled by `needsBrowser`. Emits per-strategy
// telemetry so we can see what's actually getting sites unblocked.

import { FlareSolverrClient } from "./flaresolverr";

export type FetchStrategy = "direct" | "flaresolverr";

export interface EscalationResult {
  html: string | null;
  strategy: FetchStrategy | null;
  status: number;
  blocked: boolean; // true = both tiers exhausted; caller should escalate to a real browser
}

// Heuristics for "this response is a block/challenge, not the page we wanted".
function looksBlocked(html: string, status: number): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  if (!html || html.length < 500) return true;
  const h = html.slice(0, 4000).toLowerCase();
  return (
    h.includes("just a moment") ||
    h.includes("cf-browser-verification") ||
    h.includes("cf-challenge") ||
    h.includes("attention required") ||
    h.includes("access denied") ||
    h.includes("captcha") ||
    h.includes("px-captcha") ||
    h.includes("are you a human")
  );
}

interface EscalationOpts {
  headers?: Record<string, string>;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  label?: string;
}

/**
 * Fetch a URL's HTML, escalating through tiers. Never throws — returns blocked:true when the cheap
 * tiers can't get usable HTML, so the caller can decide whether to spin up a browser.
 */
export async function escalatedFetch(
  url: string,
  opts: EscalationOpts = {},
): Promise<EscalationResult> {
  const {
    headers = {},
    userAgent,
    timeoutMs = 20000,
    retries = 2,
    label = "escalation",
  } = opts;

  // ── Tier 1: direct fetch (with light retry) ──
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            userAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...headers,
        },
      });
      clearTimeout(t);
      const html = await res.text();
      if (!looksBlocked(html, res.status)) {
        return { html, strategy: "direct", status: res.status, blocked: false };
      }
      // blocked — stop retrying direct, escalate
      break;
    } catch {
      // network error/timeout — retry with backoff, then escalate
      if (attempt < retries)
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }

  // ── Tier 2: FlareSolverr (only if configured) ──
  const fs = new FlareSolverrClient();
  if (fs.isConfigured()) {
    try {
      const html = await fs.getHtml(url, Math.max(timeoutMs, 60000));
      if (html && !looksBlocked(html, 200)) {
        console.log(`[${label}] escalated → flaresolverr`);
        return { html, strategy: "flaresolverr", status: 200, blocked: false };
      }
    } catch {
      /* fall through to blocked */
    }
  }

  // ── Exhausted: caller should try a real browser ──
  console.warn(`[${label}] cheap tiers blocked for ${url} — needs browser`);
  return { html: null, strategy: null, status: 0, blocked: true };
}
