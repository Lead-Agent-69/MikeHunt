export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * GET /api/image/proxy?url=...
 * Proxy external images that block hotlinks (Craigslist, Facebook, etc.)
 * by fetching them server-side and streaming back.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    // Validate URL to prevent SSRF
    const parsed = new URL(url);
    const allowedDomains = [
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
    ];
    
    const isAllowed = allowedDomains.some(
      (domain) =>
        parsed.hostname === domain ||
        parsed.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return new NextResponse("Domain not allowed", { status: 403 });
    }

    // Fetch the image with proper headers to avoid blocks
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: parsed.origin + "/",
      },
      // Don't cache too aggressively since listings can change
      cache: "no-store",
    });

    if (!response.ok) {
      return new NextResponse("Failed to fetch image", {
        status: response.status,
      });
    }

    // Stream the image back
    const contentType = response.headers.get("content-type") || "image/jpeg";
    
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[image-proxy] Error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
