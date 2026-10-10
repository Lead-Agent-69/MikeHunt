import axios from "axios";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import {
  type PinnedTarget,
  parsePinnableUrl,
  pinnedAxiosOptions,
  resolvePinnedTarget,
} from "@/lib/net/pinned-dns";

const MAX_REDIRECTS = 3;
/** Page-size cap. Callers can pass a smaller maxBytes, never a larger one. */
export const MAX_HTML_BYTES = 5 * 1024 * 1024;
/** Whole-fetch deadline (all hops), on top of axios' per-request timeout. */
export const PUBLIC_FETCH_DEADLINE_MS = 10_000;

/** A caller's byte limit, clamped to `cap`. NaN, 0, negative or missing all mean `cap`. */
export function clampBytes(m: number | undefined, cap: number): number {
  return typeof m === "number" && Number.isFinite(m) && m > 0
    ? Math.min(m, cap)
    : cap;
}

/** Overall deadline, combined with the caller's signal when there is one. */
export function publicFetchSignal(caller?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(PUBLIC_FETCH_DEADLINE_MS);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

/** Thrown when the overall deadline (or the caller's signal) fires while we are still waiting. */
export class FetchAborted extends Error {}

/**
 * Settle with `p`, or reject with FetchAborted as soon as `signal` aborts. `p` ALWAYS gets a handler
 * first, so a lookup/check that rejects after we stopped waiting (or on an already-aborted signal) can
 * never surface as an unhandled rejection.
 */
export function untilAborted<T>(
  p: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  p.catch(() => {});
  if (signal.aborted) return Promise.reject(new FetchAborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new FetchAborted());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/**
 * Resolve and pin `raw` inside the overall deadline.
 *  - The synchronous URL policy runs FIRST, so a blocked URL throws UrlNotAllowedError even when the
 *    signal is already aborted (e.g. deal-check's req.signal after a client disconnect).
 *  - An already-aborted signal then starts no DNS lookup at all.
 *  - Otherwise the lookup is raced against the signal; rejects with FetchAborted when it fires.
 * dns.lookup can't be cancelled: an abandoned lookup keeps occupying a libuv threadpool thread
 * (UV_THREADPOOL_SIZE, default 4, shared with fs/crypto/zlib) until the OS resolver answers or
 * times out. We only stop waiting for it; many hung lookups at once can still starve that pool.
 */
export async function pinnedTargetWithin(
  raw: string,
  signal: AbortSignal,
): Promise<PinnedTarget> {
  parsePinnableUrl(raw);
  if (signal.aborted) throw new FetchAborted();
  return untilAborted(resolvePinnedTarget(raw), signal);
}

export function locationHeader(
  headers: Record<string, unknown>,
): string | null {
  const value = headers.location ?? headers.Location;
  if (Array.isArray(value))
    return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
}

/**
 * GET a public http(s) page. Redirects are followed manually and each hop is
 * checked again, so a public URL cannot bounce onto metadata or a private IP.
 * Returns null when the site blocks or errors. Throws UrlNotAllowedError for
 * blocked targets (no fetch is sent to them).
 *
 * Bounds (apply to EVERY caller with no options: guests via save-from-url / deal-check, and the
 * scraper callers lib/scrapers/polite-html.ts and lib/scrapers/sources/index.ts alike):
 *  - body capped at MAX_HTML_BYTES (5MB); `maxBytes` can only lower it.
 *  - ONE overall deadline of PUBLIC_FETCH_DEADLINE_MS (10s) for the whole call, armed before the
 *    first DNS lookup and shared by every DNS lookup and redirect hop (not reset per hop), combined
 *    with the caller's signal. axios' 6s `timeout` is only a per-request idle timer on top of that.
 *    The source-policy check (`allowUrl`, e.g. robots.txt) is raced against the same deadline.
 *    A DNS lookup can't be cancelled, but the call stops waiting for it when the deadline fires
 *    (the abandoned lookup still holds a libuv threadpool thread; see pinnedTargetWithin).
 *  - Deadline or caller abort => null. A blocked URL still throws UrlNotAllowedError, even with an
 *    already-aborted signal.
 *  - proxy: false, and the socket is pinned to the validated addresses (pinned-dns).
 * A slow scraper page that needs more than 10s, or a page over 5MB, therefore returns null.
 */
export async function fetchPublicHtml(
  rawUrl: string,
  policyOrOptions?:
    | ((url: string) => Promise<boolean>)
    | { signal?: AbortSignal; maxBytes?: number },
): Promise<{ html: string; finalUrl: string } | null> {
  const allowUrl =
    typeof policyOrOptions === "function" ? policyOrOptions : undefined;
  const options = typeof policyOrOptions === "object" ? policyOrOptions : {};
  // The overall deadline is armed BEFORE the first DNS lookup, so slow DNS counts against it too.
  const signal = publicFetchSignal(options.signal);
  try {
    return await fetchPublicHtmlWithin(rawUrl, allowUrl, options, signal);
  } catch (error) {
    if (error instanceof FetchAborted) return null;
    throw error;
  }
}

async function fetchPublicHtmlWithin(
  rawUrl: string,
  allowUrl: ((url: string) => Promise<boolean>) | undefined,
  options: { maxBytes?: number },
  signal: AbortSignal,
): Promise<{ html: string; finalUrl: string } | null> {
  // Resolve once per hop, validate, and pin the socket to that answer (no second DNS lookup).
  let target = await pinnedTargetWithin(rawUrl, signal);
  let current = target.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (allowUrl && !(await untilAborted(allowUrl(current.toString()), signal)))
      throw new Error("Page disallowed by source policy");
    let response;
    try {
      response = await axios.get(current.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        timeout: 6000,
        signal,
        maxContentLength: clampBytes(options.maxBytes, MAX_HTML_BYTES),
        maxRedirects: 0,
        responseType: "text",
        validateStatus: () => true,
        ...pinnedAxiosOptions(target),
      });
    } catch (error) {
      if (error instanceof UrlNotAllowedError) throw error;
      return null;
    }

    const status = Number(response.status);
    if (status >= 300 && status < 400) {
      const loc = locationHeader(response.headers || {});
      if (!loc) return null;
      target = await pinnedTargetWithin(
        new URL(loc, current).toString(),
        signal,
      );
      current = target.url;
      continue;
    }
    if (status < 200 || status >= 300) return null;
    const html = typeof response.data === "string" ? response.data : "";
    if (!html.trim()) return null;
    return { html, finalUrl: current.toString() };
  }
  return null;
}
