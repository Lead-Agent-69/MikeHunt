import { SupabaseClient } from "@supabase/supabase-js";
import type { Deal } from "./deals-service";

/**
 * Downloads the primary photo for a deal from its external source,
 * uploads it to Supabase Storage, and returns the permanent public URL.
 */
export async function syncDealPhotos(
  supabase: SupabaseClient,
  deal: Pick<Deal, "id" | "images">,
): Promise<string | null> {
  if (!deal.images || deal.images.length === 0) return null;

  const primaryPhoto = deal.images[0];

  // If it's already in our bucket, skip
  if (primaryPhoto.includes("deals-photos")) {
    return primaryPhoto;
  }

  try {
    const res = await fetch(primaryPhoto, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(
        `[PhotoSync] Failed to fetch image for deal ${deal.id}: HTTP ${res.status}`,
      );
      return null;
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    const buffer = await res.arrayBuffer();
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
