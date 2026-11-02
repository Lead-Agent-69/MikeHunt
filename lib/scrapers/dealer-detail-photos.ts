import { load } from "cheerio";
import { genericExtract } from "./generic-extractor";
import { isPlaceholderPhotoUrl } from "@/lib/images/photo-evidence";
import { dealerVdpObservation } from "./dealer-vdp-observation";
import { extractVin } from "@/lib/vehicle/vin";

/** Read only the listing's gallery, never page-wide images or related inventory. */
export function dealerDetailPhotos(
  html: string,
  listingUrl: string,
  expectedVin?: string,
): string[] {
  const $ = load(html);
  const vin = extractVin(expectedVin || "") || extractVin(listingUrl);
  if (
    vin &&
    $(".vdp-identity-main").length &&
    !dealerVdpObservation(html, listingUrl, vin)
  )
    return [];
  const photos = new Set<string>();
  const add = (raw?: string) => {
    if (!raw) return;
    try {
      const url = new URL(raw, listingUrl);
      if (!["https:", "http:"].includes(url.protocol)) return;
      if (isPlaceholderPhotoUrl(url.toString())) return;
      photos.add(url.toString());
    } catch {
      /* Malformed source images cannot break a listing. */
    }
  };
  const structured = genericExtract(html);
  for (const row of structured) {
    if (vin && row.vin && row.vin.toUpperCase() !== vin) continue;
    if (row.source_url) {
      try {
        const candidate = new URL(row.source_url, listingUrl);
        const listing = new URL(listingUrl);
        if (
          candidate.origin !== listing.origin ||
          candidate.pathname !== listing.pathname
        )
          continue;
      } catch {
        continue;
      }
    } else if (structured.length !== 1) continue;
    row.images?.forEach(add);
  }
  const gallery = $(
    ".car-details .flexslider, .single-car .flexslider, .vehicle-gallery, #vehicle-gallery, .vehicle-photos, .product-gallery, .vdp-gallery, [data-gallery]",
  );
  gallery.find("[data-full]").each((_, node) => {
    add($(node).attr("data-full"));
  });
  gallery.find("img").each((_, node) => {
    // Slider clones are navigation artefacts, not extra views.
    if ($(node).closest(".clone").length) return;
    if ($(node).closest("[data-full]").length) return;
    add($(node).attr("data-src") || $(node).attr("src"));
  });
  gallery.find("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    if (href && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href)) add(href);
  });
  return Array.from(photos).slice(0, 20);
}
