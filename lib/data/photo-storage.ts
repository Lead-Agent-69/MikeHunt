import { SupabaseClient } from "@supabase/supabase-js";
import type { Deal } from "./deals-service";
import { fetchListingPhoto } from "../images/fetch-listing-photo";

function photoCacheMax(): number {
  const raw = process.env.CACHE_PHOTOS_MAX;
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Downloads the primary photo for a deal from its external source,
 * uploads it to Supabase Storage, and returns the permanent public URL.
 * Free-tier: CACHE_PHOTOS_MAX=0 (default) is a no-op so Storage cannot fill.
 */
export async function syncDealPhotos(
  supabase: SupabaseClient,
  deal: Pick<Deal, "id" | "images">,
): Promise<string | null> {
  if (photoCacheMax() <= 0) return null;
  if (!deal.images || deal.images.length === 0) return null;

  const primaryPhoto = deal.images[0];

  // If it's already in our bucket, skip
  if (primaryPhoto.includes("deals-photos")) {
    return primaryPhoto;
  }

  try {
    // Allowlisted listing CDNs only, pinned + capped (see lib/images/fetch-listing-photo).
    const img = await fetchListingPhoto(primaryPhoto);
    if (!img) {
      console.warn(
        `[PhotoSync] Could not fetch an allowed image for deal ${deal.id}`,
      );
      return null;
    }
    const { contentType, body: buffer } = img;
    const extension = contentType.split("/")[1]?.split(";")[0] || "jpg";
    const path = `${deal.id}/primary.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("deals-photos")
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(
        `[PhotoSync] Upload failed for deal ${deal.id}:`,
        uploadError,
      );
      return null;
    }

    const { data } = supabase.storage.from("deals-photos").getPublicUrl(path);
    return data.publicUrl;
  } catch (error) {
    console.error(`[PhotoSync] Exception processing deal ${deal.id}:`, error);
    return null;
  }
}
