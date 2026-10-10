import { retiredBypass } from "../retired";
// lib/scrapers/tools/flaresolverr.ts
// Self-hosted Cloudflare/anti-bot bypass client. Falls back to direct fetch if not configured.

export interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    cookies?: Array<{ name: string; value: string; domain: string }>;
    userAgent?: string;
    headers?: Record<string, string>;
    response?: string;
  };
  error?: string;
}

export class FlareSolverrClient {
  private url: string;
  private sessionId: string | null = null;
  private sessionCreatedAt = 0;
  private static readonly SESSION_TTL_MS = 90 * 60_000; // reuse a session 1-2h, then rotate

  constructor(url = process.env.FLARESOLVERR_URL) {
    this.url = url || "";
  }

  /** Retired: FlareSolverr exists to solve bot challenges, which we never do. Always false. */
  isConfigured(): boolean {
    return false;
  }

  /** Create (or reuse) a FlareSolverr session so challenges stay solved across pages. */
  private async ensureSession(): Promise<string | null> {
    if (!this.isConfigured()) return null;
    if (
      this.sessionId &&
      Date.now() - this.sessionCreatedAt < FlareSolverrClient.SESSION_TTL_MS
    ) {
      return this.sessionId;
    }
    try {
      // Best-effort: destroy the expired session before rotating (ignore errors).
      if (this.sessionId) {
        await this.cmd({
          cmd: "sessions.destroy",
          session: this.sessionId,
        }).catch(() => {});
      }
      const res = await this.cmd<{ session: string }>({
        cmd: "sessions.create",
      });
      const sid = (res as unknown as { session?: string })?.session;
      if (sid) {
        this.sessionId = sid;
        this.sessionCreatedAt = Date.now();
        console.log(`[FlareSolverr] session created (${sid.slice(0, 8)}…)`);
        return sid;
      }
    } catch (e) {
      console.warn(
        `[FlareSolverr] sessions.create failed, continuing sessionless: ${(e as Error).message}`,
      );
    }
    return null;
  }

  private async cmd<T>(payload: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.url}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`FlareSolverr HTTP error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async fetch(
    url: string,
    options: {
      timeout?: number;
      method?: "GET" | "POST";
      body?: Record<string, unknown>;
    } = {},
  ): Promise<FlareSolverrResponse> {
    if (!this.isConfigured()) {
      throw new Error("FlareSolverr not configured. Set FLARESOLVERR_URL.");
    }

    const res = await fetch(`${this.url}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // AbortSignal.timeout gives a REAL timeout — without it a hung FlareSolverr
      // holds the source slot forever and the caller falls back to Playwright late.
      signal: AbortSignal.timeout(options.timeout || 60000),
      body: JSON.stringify({
        cmd: "request.get",
        url,
        timeout: options.timeout || 60000,
        maxTimeout: options.timeout || 60000,
        session: (await this.ensureSession()) || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`FlareSolverr HTTP error: ${res.status}`);
    }

    return res.json() as Promise<FlareSolverrResponse>;
  }

  async getHtml(url: string, timeout = 60000): Promise<string> {
    void url;
    void timeout;
    return retiredBypass("flaresolverr");
  }
}

export async function fetchWithFlareSolverrFallback(
  url: string,
  options?: RequestInit,
  timeout = 60000,
): Promise<Response> {
  const client = new FlareSolverrClient();
  if (!client.isConfigured()) {
    return fetch(url, options);
  }

  try {
    const html = await client.getHtml(url, timeout);
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (e) {
    // Fallback to direct fetch if FlareSolverr fails
    return fetch(url, options);
  }
}
