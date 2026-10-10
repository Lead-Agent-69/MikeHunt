/**
 * scraperFetch: drop-in for `fetch` in source adapters. In polite mode (the default) every call goes
 * through politeFetch: robots.txt + Crawl-delay, per-domain randomized pacing, honest User-Agent,
 * Retry-After/backoff, the ban-risk breaker and per-domain metrics. The caller's User-Agent and
 * browser-fingerprint headers are dropped. A request polite mode refuses (robots disallow, paused
 * domain, challenge page) comes back as status 599 with `x-polite-skipped`, so callers' existing
 * `if (!res.ok)` handling stops cleanly. With SCRAPER_POLITE_MODE=0 it is plain fetch.
 */
import { politeFetch, politeModeEnabled } from "./polite-fetch";

export const POLITE_SKIP_STATUS = 599;

function headerRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  new Headers(h).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export async function scraperFetch(
  url: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const href = String(url);
  if (!politeModeEnabled()) return fetch(href, init);
  if (init.body != null && typeof init.body !== "string")
    throw new Error("scraperFetch: only string bodies are supported in polite mode");
  const headers = headerRecord(init.headers);
  const accept = headers["accept"];
  delete headers["accept"];
  const res = await politeFetch(href, {
    method: init.method,
    body: (init.body as string | undefined) ?? undefined,
    headers,
    accept,
    signal: init.signal ?? undefined,
  });
  if (res.skipped || res.challenge || res.status === 0) {
    return new Response("", {
      status: POLITE_SKIP_STATUS,
      headers: {
        "x-polite-skipped": res.skipped ?? (res.challenge ? "challenge" : "network"),
      },
    });
  }
  const status = res.status >= 200 && res.status <= 599 ? res.status : 500;
  return new Response([204, 205, 304].includes(status) ? null : res.body, {
    status,
    headers: res.headers ?? {},
  });
}
