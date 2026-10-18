// Observed on two distinct source listings on 2026-10-18; downloaded bytes matched
// ef3211bbb7d87a7725d5b7123e1e9282a3187c1851c77d0ef57d9623753f78ab.
const KNOWN_PLACEHOLDER_ASSET =
  /^\/cgu\/[A-HJ-NPR-Z0-9]{17}_\d+_725a472cc3c53688563f3c07811b3cc0_3_[a-f0-9]{32}\.webp$/i;

/** Known source identifiers only; an unrecognized image is not visually verified. */
export function isPlaceholderPhotoUrl(value: string): boolean {
  try {
    let url = new URL(value, "https://local.invalid");
    if (value.startsWith("/api/image/proxy?") && url.searchParams.get("url"))
      url = new URL(url.searchParams.get("url")!, "https://local.invalid");
    if (
      url.hostname === "thumb.autotempest.com" &&
      KNOWN_PLACEHOLDER_ASSET.test(url.pathname)
    )
      return true;
    return /(?:^|\/)(?:no[-_]?image|no[-_]?photo|car-placeholder|placeholder)(?:[-_]?\d+)?\.(?:jpe?g|png|webp|gif)$/i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

export function photoEvidence(value: unknown, audit?: unknown) {
  const reported = Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (url): url is string => typeof url === "string" && !!url.trim(),
          ),
        ),
      )
    : [];
  const recorded =
    audit &&
    typeof audit === "object" &&
    "placeholderUrls" in audit &&
    Array.isArray(audit.placeholderUrls)
      ? new Set(
          audit.placeholderUrls.filter(
            (url): url is string => typeof url === "string",
          ),
        )
      : new Set<string>();
  const placeholderUrls = reported.filter(
    (url) => isPlaceholderPhotoUrl(url) || recorded.has(url),
  );
  const excluded = new Set(placeholderUrls);
  return {
    images: reported.filter((url) => !excluded.has(url)),
    placeholderUrls,
    placeholderCount: placeholderUrls.length,
    reportedCount: reported.length,
  };
}
