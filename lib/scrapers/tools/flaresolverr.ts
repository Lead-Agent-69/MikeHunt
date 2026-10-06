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

  isConfigured(): boolean {
    return Boolean(this.url);
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
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await this.fetch(url, { timeout });
        if (result.status !== "ok" || !result.solution?.response) {
          throw new Error(
            `FlareSolverr failed: ${result.message || result.error || "unknown"}`,
          );
        }

        const html = result.solution.response;
        // Detect if FlareSolverr returned a Cloudflare block page instead of the real content
        if (
          html.includes("Attention Required! | Cloudflare") ||
          html.includes("Just a moment...") ||
          html.includes("cf-browser-verification")
        ) {
          throw new Error("FlareSolverr returned a Cloudflare challenge page");
        }

        return html;
      } catch (err: any) {
        lastError = err;
        if (attempt <= maxRetries) {
          console.warn(
            `[FlareSolverr] Attempt ${attempt} failed for ${url}: ${err.message}. Retrying in ${attempt * 2}s...`,
          );
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    }

    throw new Error(
      `FlareSolverr failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`,
    );
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
