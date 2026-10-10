import { NextResponse } from "next/server";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import { fetchPublicImage } from "@/lib/net/fetch-public-image";

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
  "salvagezone.com",
] as const;

const ALLOWED_IMAGE_HOSTS = new Set([
  "d37qv0n5b4mbzm.cloudfront.net",
  "gsa-prod-ppms-attachments-prod.s3.amazonaws.com",
  // Platform dealers (4cdg / VehiclesNETWORK) self-host their photos. Exact hosts only, checked
  // 2026-10-10 from each inventory page; lib/scrapers/curated-image-hosts.test.ts keeps this in step
  // with the platform-tagged entries in lib/scrapers/curated-sites.ts.
  "affordableusedcars.com",
  "autoworksinc.com",
  "beasautosales.com",
  "camachoauto.com",
  "craseautoil.com",
  "crowncitymotors.com",
  "data.rebuildautos.com",
  "drivenation.com",
  "duntonmotors.com",
  "glensautosales.com",
  "jakesautomall.com",
  "kwsautosales.com",
  "missoulacarandtruck.com",
  "mnrepairables.com",
  "prestigeautobrokers.com",
  "randyadamsinc.com",
  "redcarpetautosales.net",
  "ridetimeautocredit.com",
  "southsiderebuilders.com",
  "texasbhph.com",
  "usedcarsanchorageak.com",
  "usedcarsokc.com",
  "wildwestomaha.com",
  "www.affordableusedcars.com",
  "www.autoworksinc.com",
  "www.beasautosales.com",
  "www.camachoauto.com",
  "www.craseautoil.com",
  "www.crowncitymotors.com",
  "www.drivenation.com",
  "www.duntonmotors.com",
  "www.glensautosales.com",
  "www.jakesautomall.com",
  "www.kwsautosales.com",
  "www.missoulacarandtruck.com",
  "www.mnrepairables.com",
  "www.prestigeautobrokers.com",
  "www.randyadamsinc.com",
  "www.redcarpetautosales.net",
  "www.ridetimeautocredit.com",
  "www.southsiderebuilders.com",
  "www.texasbhph.com",
  "www.usedcarsanchorageak.com",
  "www.usedcarsokc.com",
  "www.wildwestomaha.com",
  "greensautotn.com",
  "www.greensautotn.com",
  "usedcarslewistonid.com",
  "www.usedcarslewistonid.com",
  "usedcarsdedhamma.com",
  "www.usedcarsdedhamma.com",
  "usedcarsmahopacny.com",
  "www.usedcarsmahopacny.com",
  "4seasonsauto.com",
  "www.4seasonsauto.com",
  "d1autocredit.com",
  "www.d1autocredit.com",
  // Zero-source-state dealers (Elle's audit 2026-10-10): platform photo CDNs seen on their pages,
  // then each dealer's own host. curated-image-hosts.test.ts checks every registry photoHosts entry.
  "static.overfuel.com",
  "cdn-ds.com",
  "imageserver.promaxinventory.com",
  "cdn.dealrimages.com",
  "www.adimsweb.com",
  "carmartde.com",
  "www.carmartde.com",
  "alohaautodepot.com",
  "www.alohaautodepot.com",
  "choiceautohawaii.com",
  "www.choiceautohawaii.com",
  "843auto.com",
  "www.843auto.com",
  "rennkirbyfrederick.com",
  "www.rennkirbyfrederick.com",
  "usedtrucksidahofalls.com",
  "www.usedtrucksidahofalls.com",
  "soniasautosales.com",
  "www.soniasautosales.com",
  "helloautogs.com",
  "www.helloautogs.com",
  "craftautosales.com",
  "www.craftautosales.com",
  "mbautosalesms.com",
  "www.mbautosalesms.com",
  "bandlcars.com",
  "www.bandlcars.com",
  "davidcarstn.com",
  "www.davidcarstn.com",
  "summitautoexchange.com",
  "www.summitautoexchange.com",
  "307motors.com",
  "www.307motors.com",
  // NM (Elle's section V, 2026-10-10): L&L Auto Sales; photos come from static.overfuel.com (above).
  "landlusedcars.com",
  "www.landlusedcars.com",
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
 * by fetching them server-side and returning the bytes. CDN-cacheable — clients
 * should prefer direct source URLs and only hit this for hotlink hosts.
 *
 * SSRF: the host allowlist alone isn't enough (an allowed host can redirect, or
 * its DNS can point somewhere private). fetchPublicImage re-checks the allowlist
 * and assertPublicHttpUrl on the first URL and on every redirect hop, follows
 * redirects manually (max 3), and pins sockets to public IPs. Only raster image
 * types are returned (no SVG/HTML), with nosniff and a sandbox CSP.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  if (!isAllowedImageUrl(url)) {
    return new NextResponse("Domain not allowed", { status: 403 });
  }

  try {
    const parsed = new URL(url);
    const result = await fetchPublicImage(url, isAllowedImageUrl, {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: parsed.origin + "/",
    });

    if (!result.ok) {
      return new NextResponse("Failed to fetch image", {
        status: result.status,
      });
    }

    return new NextResponse(new Uint8Array(result.body), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": CACHE_CONTROL,
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof UrlNotAllowedError) {
      return new NextResponse("Domain not allowed", { status: 403 });
    }
    console.error("[image-proxy] Error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
