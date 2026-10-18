import { fetchPublicImage } from "@/lib/net/fetch-public-image";
import { isAllowedImageUrl } from "./image-hosts";
import { sniffImageType, PHOTO_CACHE_MAX_BYTES } from "./fetch-listing-photo";
import { reportedListingPhotos } from "@/lib/search/customer-inventory";
import { isPlaceholderPhotoUrl } from "./photo-evidence";
import { isPlaceholderPhotoBody } from "./photo-fingerprint";

export type PhotoProbe = {
  state: "available" | "missing" | "unknown" | "placeholder";
  status?: number;
};
export async function probeListingPhoto(
  url: string,
  signal?: AbortSignal,
): Promise<PhotoProbe> {
  if (isPlaceholderPhotoUrl(url)) return { state: "placeholder" };
  if (!isAllowedImageUrl(url)) return { state: "unknown" };
  try {
    const result = await fetchPublicImage(
      url,
      isAllowedImageUrl,
      { Accept: "image/*", Referer: `${new URL(url).origin}/` },
      { signal, maxBytes: PHOTO_CACHE_MAX_BYTES },
    );
    if (result.ok)
      return {
        // A successful response can still be a CDN challenge or temporary error page.
        state: !sniffImageType(result.body)
          ? "unknown"
          : isPlaceholderPhotoBody(result.body)
            ? "placeholder"
            : "available",
        status: 200,
      };
    return {
      state: [404, 410].includes(result.status) ? "missing" : "unknown",
      status: result.status,
    };
  } catch {
    return { state: "unknown" };
  }
}

/** Unchecked URLs and temporary access failures must never become a definitive missing verdict. */
export async function inspectListingPhotos(
  urls: unknown,
  options: {
    signal?: AbortSignal;
    maxPhotos?: number;
    probe?: (url: string, signal?: AbortSignal) => Promise<PhotoProbe>;
  } = {},
) {
  const images = reportedListingPhotos(urls);
  const checks: Array<PhotoProbe & { url: string }> = [];
  let verifiedUrl: string | undefined;
  for (const url of images.slice(
    0,
    Math.min(5, Math.max(1, options.maxPhotos ?? 3)),
  )) {
    options.signal?.throwIfAborted();
    const result = await (options.probe ?? probeListingPhoto)(
      url,
      options.signal,
    );
    checks.push({ ...result, url });
    if (result.state === "available") {
      verifiedUrl = url;
      break;
    }
  }
  options.signal?.throwIfAborted();
  const state: "available" | "unavailable" | "unknown" | "placeholder" =
    verifiedUrl
      ? "available"
      : checks.length === images.length &&
          checks.every((check) => check.state === "missing")
        ? "unavailable"
        : checks.length === images.length &&
            checks.some((check) => check.state === "placeholder") &&
            checks.every((check) =>
              ["missing", "placeholder"].includes(check.state),
            )
          ? "placeholder"
          : "unknown";
  const missing = new Set(
    checks
      .filter((check) => check.state === "missing")
      .map((check) => check.url),
  );
  const retained = images.filter((url) => !missing.has(url));
  return {
    state,
    checkedAt: new Date().toISOString(),
    verifiedUrl: verifiedUrl ?? null,
    placeholderUrls: checks
      .filter((check) => check.state === "placeholder")
      .map((check) => check.url),
    checks,
    images: verifiedUrl
      ? [verifiedUrl, ...retained.filter((url) => url !== verifiedUrl)]
      : images,
  };
}
