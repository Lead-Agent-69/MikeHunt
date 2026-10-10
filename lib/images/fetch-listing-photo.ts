// The only way the photo caches download bytes: allowlisted listing CDNs, every hop re-checked
// against the allowlist and the public-IP guard, DNS pinned, redirects followed manually (max 3),
// byte cap, overall deadline. Returns null on any refusal or failure (best-effort caches).
import { fetchPublicImage } from "../net/fetch-public-image";
import { isAllowedImageUrl } from "./image-hosts";

/** Per-photo cap for anything we'd store; listing photos are well under this. */
export const PHOTO_CACHE_MAX_BYTES = 5 * 1024 * 1024;

const PHOTO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
};

export async function fetchListingPhoto(
  url: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const res = await fetchPublicImage(
      url,
      isAllowedImageUrl,
      { ...PHOTO_HEADERS, Referer: `${new URL(url).origin}/` },
      { maxBytes: PHOTO_CACHE_MAX_BYTES },
    );
    return res.ok ? { body: res.body, contentType: res.contentType } : null;
  } catch {
    // UrlNotAllowedError (blocked hop) or anything unexpected.
    return null;
  }
}
