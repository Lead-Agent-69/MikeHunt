// Listing-image host allowlist, shared by the image proxy and the (dormant) photo caches.
// These are the CDNs our sources actually emit image URLs on: craigslist (images.craigslist.org),
// Facebook (fbcdn), eBay (ebayimg), GovDeals/AllSurplus via LQDT (webassets.lqdt1.com),
// GSA Auctions (its S3 attachments bucket), plus the marketplace / dealer hosts already verified in
// imported inventory. lib/images/image-hosts.test.ts checks the image bases declared in
// lib/scrapers/sources stay covered.

export const LISTING_IMAGE_DOMAINS = [
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

export const LISTING_IMAGE_HOSTS: ReadonlySet<string> = new Set([
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
]);

export function isAllowedImageUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return (
      LISTING_IMAGE_HOSTS.has(hostname) ||
      LISTING_IMAGE_DOMAINS.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}
