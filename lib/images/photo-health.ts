import { fetchPublicImage } from "@/lib/net/fetch-public-image";
import { isAllowedImageUrl } from "./image-hosts";
import { sniffImageType, PHOTO_CACHE_MAX_BYTES } from "./fetch-listing-photo";
import { listingPhotos } from "@/lib/search/customer-inventory";

export type PhotoProbe = {
  state: "available" | "missing" | "unknown";
  status?: number;
};
export async function probeListingPhoto(
  url: string,
  signal?: AbortSignal,
): Promise<PhotoProbe> {
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
        state: sniffImageType(result.body) ? "available" : "missing",
        status: 200,
      };
    return {
      state: [404, 410, 415].includes(result.status) ? "missing" : "unknown",
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
  const images = listingPhotos(urls);
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
  const state: "available" | "unavailable" | "unknown" = verifiedUrl
    ? "available"
    : checks.length === images.length &&
        checks.every((check) => check.state === "missing")
      ? "unavailable"
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
    checks,
    images: verifiedUrl
      ? [verifiedUrl, ...retained.filter((url) => url !== verifiedUrl)]
      : images,
  };
}
