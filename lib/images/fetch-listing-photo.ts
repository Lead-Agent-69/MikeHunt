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

const ascii = (b: Buffer, start: number, end: number) =>
  b.length >= end ? b.toString("latin1", start, end) : "";

/**
 * Raster type from magic bytes, or null. We only store what the bytes prove: a missing,
 * octet-stream or mislabeled Content-Type never becomes image/jpeg on its own.
 */
export function sniffImageType(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "image/jpeg";
  if (
    b.length >= 8 &&
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  const gif = ascii(b, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP")
    return "image/webp";
  // ISO-BMFF: [size][ftyp][major brand][minor version][compatible brands...] in the ftyp box.
  if (ascii(b, 4, 8) === "ftyp") {
    const boxEnd = Math.min(b.readUInt32BE(0), b.length, 64);
    const brands = [ascii(b, 8, 12)];
    for (let i = 16; i + 4 <= boxEnd; i += 4) brands.push(ascii(b, i, i + 4));
    if (brands.some((x) => x === "avif" || x === "avis")) return "image/avif";
  }
  return null;
}

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
    if (!res.ok) return null;
    // Stored objects get the type the bytes prove, never a defaulted image/jpeg.
    const contentType = sniffImageType(res.body);
    return contentType ? { body: res.body, contentType } : null;
  } catch {
    // UrlNotAllowedError (blocked hop) or anything unexpected.
    return null;
  }
}
