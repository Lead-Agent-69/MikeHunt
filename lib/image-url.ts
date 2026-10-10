// Prefer direct source CDN URLs for listing photos (free-tier: no Storage,
// fewer Vercel proxy invokes). Proxy only hosts known to hotlink-block.
// Local/already-proxied/data/our Storage URLs pass through untouched.

// Craigslist and Facebook photos are never proxied (Ren #321 R1 / #322): they render direct. Craigslist
// images load cross-site without a referrer check (checked 2026-10-10).
const HOTLINK_BLOCK_DOMAINS = ["salvagezone.com"] as const;

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
