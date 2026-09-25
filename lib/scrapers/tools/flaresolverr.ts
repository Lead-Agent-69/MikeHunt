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

  constructor(url = process.env.FLARESOLVERR_URL) {
    this.url = url || "";
  }

  isConfigured(): boolean {
    return Boolean(this.url);
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
      body: JSON.stringify({
        cmd: "request.get",
        url,
        timeout: options.timeout || 60000,
        maxTimeout: options.timeout || 60000,
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
