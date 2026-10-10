import axios from "axios";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import { pinnedAxiosOptions, resolvePinnedTarget } from "@/lib/net/pinned-dns";

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
  // Resolve once per hop, validate, and pin the socket to that answer (no second DNS lookup).
  let target = await resolvePinnedTarget(rawUrl);
  let current = target.url;
  const signal = publicFetchSignal(options.signal);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (allowUrl && !(await allowUrl(current.toString())))
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
      target = await resolvePinnedTarget(new URL(loc, current).toString());
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
