// Download a deal's listing photos and store them permanently in Supabase Storage (vehicle-photos),
// returning our own public URLs. Solves hotlink blocking, source expiry, and proxy latency for the
// deals that matter. Best-effort — returns what it managed to cache.

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "vehicle-photos";

async function fetchImage(
  url: string,
): Promise<{ buf: ArrayBuffer; type: string } | null> {
  try {
    const origin = new URL(url).origin;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Referer: origin,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    return { buf: await res.arrayBuffer(), type };
  } catch {
    return null;
  }
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
  const out: string[] = [];
  for (let i = 0; i < Math.min(urls.length, max); i++) {
    const u = urls[i];
    if (!u || !/^https?:\/\//.test(u)) continue;
    // Skip ones we've already hosted.
    if (u.includes(`/storage/v1/object/public/${BUCKET}/`)) {
      out.push(u);
      continue;
    }
    const img = await fetchImage(u);
    if (!img) continue;
    const path = `${dealId}/${i}.${ext(img.type)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, img.buf, {
      contentType: img.type,
      upsert: true,
      cacheControl: "2592000",
    });
    if (error) continue;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (data?.publicUrl) out.push(data.publicUrl);
  }
  return out;
}
