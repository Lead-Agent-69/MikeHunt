import { UrlNotAllowedError, assertPublicHttpUrl } from "@/lib/net/public-url";

/** Max HTTP redirects a guarded browser navigation may take before we refuse it. */
export const MAX_BROWSER_REDIRECTS = 3;

/** Minimal shapes of the Playwright/Patchright objects we touch (keeps this unit-testable). */
export interface GuardRouteLike {
  request(): { url(): string };
  abort(errorCode?: string): Promise<void>;
  fallback(): Promise<void>;
}
export interface GuardRequestLike {
  url(): string;
  redirectedFrom(): GuardRequestLike | null;
}

/** In-page URLs that never leave the browser process. */
function isLocalScheme(url: string): boolean {
  return (
    url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank"
  );
}

/**
 * Route handler for a server-side browser reading a user-pasted page.
 * Every request the page makes (document, redirect hop when intercepted, XHR,
 * iframe, script, ...) must be a public http(s) URL; anything aimed at
 * localhost, RFC1918, link-local, or metadata is aborted before it is sent.
 * Allowed requests fall back to the next handler (e.g. the resource-type blocker).
 */
export async function guardPublicRoute(route: GuardRouteLike): Promise<void> {
  const url = route.request().url();
  if (isLocalScheme(url)) return route.fallback();
  try {
    await assertPublicHttpUrl(url);
  } catch {
    return route.abort("blockedbyclient");
  }
  return route.fallback();
}

/**
 * After a navigation, walk the redirect chain that produced the main document.
 * Refuses (UrlNotAllowedError) when the chain is longer than MAX_BROWSER_REDIRECTS
 * or any hop / the final URL is not public. Runs even when route interception
 * already saw each hop, so a redirect the router missed can't slip content through.
 */
export async function assertNavigationChainPublic(
  request: GuardRequestLike | null | undefined,
  finalUrl: string,
  maxRedirects = MAX_BROWSER_REDIRECTS,
): Promise<void> {
  const urls: string[] = [];
  let hop: GuardRequestLike | null | undefined = request;
  while (hop) {
    urls.push(hop.url());
    if (urls.length > maxRedirects + 1) {
      throw new UrlNotAllowedError("Too many redirects");
    }
    hop = hop.redirectedFrom();
  }
  urls.push(finalUrl);
  for (const url of urls) {
    if (isLocalScheme(url)) continue;
    await assertPublicHttpUrl(url);
  }
}
