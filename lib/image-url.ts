// Prefer direct source CDN URLs for listing photos (free-tier: no Storage,
// fewer Vercel proxy invokes). Proxy only hosts known to hotlink-block.
// Local/already-proxied/data/our Storage URLs pass through untouched.
// Hosts whose source access class is not "open" (needs_permission / restricted / operator_override,
// e.g. data.rebuildautos.com) are never proxied: they get their direct source URL, and an already-
// proxied URL for such a host is unwrapped back to the direct URL (the proxy would refuse it anyway).

import { imageProxyAllowed } from "@/lib/images/proxy-access";

const HOTLINK_BLOCK_DOMAINS = [
  "craigslist.org",
  "fbcdn.net",
  "facebook.com",
  "salvagezone.com",
] as const;

const OUR_STORAGE_MARKERS = [
  "/storage/v1/object/public/vehicle-photos/",
  "/storage/v1/object/public/deals-photos/",
] as const;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** If `url` is our proxy URL for a host the proxy must not serve, return the direct source URL. */
function unwrapDeniedProxy(url: string): string {
  if (!url.includes("/api/image/proxy")) return url;
  try {
    const inner = new URL(url, "http://local.invalid").searchParams.get("url");
    if (inner && /^https?:\/\//.test(inner) && !imageProxyAllowed(inner))
      return inner;
  } catch {
    /* keep as is */
  }
  return url;
}

/** True when the host typically blocks hotlinks and needs our allowlisted proxy. */
export function needsImageProxy(url?: string | null): boolean {
  if (!url || !/^https?:\/\//.test(url)) return false;
  const hostname = hostnameOf(url);
  if (!hostname) return false;
  return HOTLINK_BLOCK_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/**
 * Listing photo src for <img>. Direct source URL when safe; proxy only for
 * known hotlink blockers. Gallery thumbs and cards should call this (not
 * next/image) so Vercel Image Optimization quota stays unused.
 */
export function proxiedImage(url?: string | null): string {
  if (!url) return "";
  url = unwrapDeniedProxy(url);
  if (
    url.startsWith("/") ||
    url.startsWith("data:") ||
    url.includes("/api/image/proxy") ||
    OUR_STORAGE_MARKERS.some((m) => url.includes(m))
  ) {
    return url;
  }
  if (!/^https?:\/\//.test(url)) return url;
  if (!needsImageProxy(url)) return url;
  if (!imageProxyAllowed(url)) return url;
  return `/api/image/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Gallery helper: proxy only the hero when the host hotlink-blocks; secondary
 * frames stay direct so we do not multiply proxy traffic for every thumb.
 * Hotlink hosts still need every frame proxied (they will not load direct).
 */
export function galleryImageSrc(
  url: string | null | undefined,
  index: number,
): string {
  if (!url) return "";
  url = unwrapDeniedProxy(url);
  if (index === 0) return proxiedImage(url);
  if (needsImageProxy(url)) return proxiedImage(url);
  if (
    url.startsWith("/") ||
    url.startsWith("data:") ||
    url.includes("/api/image/proxy") ||
    OUR_STORAGE_MARKERS.some((m) => url.includes(m))
  ) {
    return url;
  }
  if (!/^https?:\/\//.test(url)) return url;
  return url;
}
