import { NextResponse } from "next/server";

const ALLOWED_IMAGE_DOMAINS = [
  "craigslist.org",
  "fbcdn.net",
  "facebook.com",
  "cargurus.com",
  "cars.com",
  "autotrader.com",
  "ebay.com",
  "ebayimg.com",
  "copart.com",
  "iaai.com",
  // Verified hosts used by the currently imported government/dealer inventory.
  "lqdt1.com",
  "recar.com",
  "stjamesautoparts.com",
  "dgautollc.com",
  "dealerzone.com",
] as const;

const ALLOWED_IMAGE_HOSTS = new Set([
  "d37qv0n5b4mbzm.cloudfront.net",
  "gsa-prod-ppms-attachments-prod.s3.amazonaws.com",
]);

/** ~1 day at the CDN / edge; browsers may refresh a bit sooner. */
const CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export function isAllowedImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    return (
      ALLOWED_IMAGE_HOSTS.has(hostname) ||
      ALLOWED_IMAGE_DOMAINS.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

/**
 * GET /api/image/proxy?url=...
 * Proxy external images that block hotlinks (Craigslist, Facebook, etc.)
 * by fetching them server-side and streaming back. CDN-cacheable — clients
 * should prefer direct source URLs and only hit this for hotlink hosts.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    // Validate URL to prevent SSRF. Keep this tied to verified listing-photo hosts.
    const parsed = new URL(url);
    if (!isAllowedImageUrl(url)) {
      return new NextResponse("Domain not allowed", { status: 403 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: parsed.origin + "/",
      },
      // Edge/CDN may reuse for a day; listing photos are stable enough.
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return new NextResponse("Failed to fetch image", {
        status: response.status,
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[image-proxy] Error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
