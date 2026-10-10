import { retiredBypass } from "../retired";
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

export function getFlareSolverr(): FlareSolverr {
  // Retired: we do not solve bot challenges (lib/scrapers/retired.ts).
  return retiredBypass("flaresolverr");
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
  // Retired: we never bypass Cloudflare or any bot protection (lib/scrapers/retired.ts).
  void url;
  void options;
  return retiredBypass("cloudflare-bypass");
}
