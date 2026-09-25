// lib/scrapers/bypass/flaresolverr.ts
// FlareSolverr integration for bypassing Cloudflare protection

interface FlareSolverrRequest {
  cmd: "request.get" | "request.post";
  url: string;
  maxTimeout?: number;
  cookies?: Array<{ name: string; value: string }>;
  returnOnlyCookies?: boolean;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution: {
    url: string;
    status: number;
    cookies: Array<{ name: string; value: string; domain: string }>;
    userAgent: string;
    headers: Record<string, string>;
    response: string;
  };
  startTimestamp: number;
  endTimestamp: number;
  version: string;
}

export class FlareSolverr {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout = 60000) {
    this.baseUrl =
      baseUrl || process.env.FLARESOLVERR_URL || "http://localhost:8191";
    this.timeout = timeout;
  }

  /**
   * Fetch a URL through FlareSolverr to bypass Cloudflare protection
   */
  async get(
    url: string,
    options?: { cookies?: Array<{ name: string; value: string }> },
  ): Promise<{
    html: string;
    cookies: Array<{ name: string; value: string; domain: string }>;
    userAgent: string;
    status: number;
  }> {
    const payload: FlareSolverrRequest = {
      cmd: "request.get",
      url,
      maxTimeout: this.timeout,
      cookies: options?.cookies,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`FlareSolverr HTTP error: ${response.status}`);
      }

      const data: FlareSolverrResponse = await response.json();

      if (data.status !== "ok") {
        throw new Error(`FlareSolverr error: ${data.message}`);
      }

      return {
        html: data.solution.response,
        cookies: data.solution.cookies,
        userAgent: data.solution.userAgent,
        status: data.solution.status,
      };
    } catch (error) {
      console.error("[FlareSolverr] Error:", error);
      throw error;
    }
  }

  /**
   * Check if FlareSolverr is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let flareSolverrInstance: FlareSolverr | null = null;

export function getFlareSolverr(): FlareSolverr {
  if (!flareSolverrInstance) {
    flareSolverrInstance = new FlareSolverr();
  }
  return flareSolverrInstance;
}

/**
 * Fetch HTML with automatic Cloudflare bypass fallback
 */
export async function fetchWithCloudflareBypass(
  url: string,
  options?: {
    cookies?: Array<{ name: string; value: string }>;
    useFlareSolverr?: boolean;
  },
): Promise<string> {
  const flare = getFlareSolverr();

  // Check if FlareSolverr is available and requested
  if (options?.useFlareSolverr !== false) {
    const available = await flare.isAvailable();
    if (available) {
      console.log(`[FlareSolverr] Using FlareSolverr for ${url}`);
      const result = await flare.get(url, { cookies: options?.cookies });
      return result.html;
    } else {
      console.warn(
        "[FlareSolverr] Not available, falling back to direct fetch",
      );
    }
  }

  // Fallback to direct fetch
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.text();
}
