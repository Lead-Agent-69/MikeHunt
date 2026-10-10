// Download a deal's listing photos and store them permanently in Supabase Storage (vehicle-photos),
// returning our own public URLs. Solves hotlink blocking, source expiry, and proxy latency for the
// deals that matter. Best-effort — returns what it managed to cache.
// Free-tier: CACHE_PHOTOS_MAX unset or 0 returns [] so Storage cannot fill.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchListingPhoto } from "./fetch-listing-photo";

const BUCKET = "vehicle-photos";

function isPhotoCacheDisabled(): boolean {
  const raw = process.env.CACHE_PHOTOS_MAX;
  if (raw === undefined || raw === "") return true;
  const n = Number(raw);
  return !Number.isFinite(n) || n <= 0;
}

const ext = (type: string) =>
  type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";

/** Cache up to `max` photos for a deal; returns the Supabase public URLs (empty on total failure). */
export async function cacheVehiclePhotos(
  sb: SupabaseClient,
  dealId: string,
  urls: string[],
  max = 6,
): Promise<string[]> {
  if (isPhotoCacheDisabled()) return [];

  const out: string[] = [];
  const capped = Math.min(urls.length, max);
  for (let i = 0; i < capped; i++) {
    const u = urls[i];
    if (!u || !/^https?:\/\//.test(u)) continue;
    // Skip ones we've already hosted.
    if (u.includes(`/storage/v1/object/public/${BUCKET}/`)) {
      out.push(u);
      continue;
    }
    // Allowlisted listing CDNs only, pinned + capped (see fetch-listing-photo).
    const img = await fetchListingPhoto(u);
    if (!img) continue;
    const path = `${dealId}/${i}.${ext(img.contentType)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, img.body, {
      contentType: img.contentType,
      upsert: true,
      cacheControl: "2592000",
    });
    if (error) continue;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (data?.publicUrl) out.push(data.publicUrl);
  }
  return out;
}
