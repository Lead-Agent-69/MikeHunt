// Observed on two distinct source listings on 2026-10-18; downloaded bytes matched
// ef3211bbb7d87a7725d5b7123e1e9282a3187c1851c77d0ef57d9623753f78ab.
const KNOWN_PLACEHOLDER_PATHS = new Set([
  // Visually inspected "NEW ARRIVAL / IMAGES COMING SOON", 2026-10-26.
  // Downloaded bytes: d99d31a97c71fb1ea1769ba84bfa787a4c54789b4bfcbf3290c83f92cbafe5ef.
  "/cgu/3GNAXTEG2VL254379_462491482_313a6e27729c693363f3423cf5d3a729_1_c32e3555544e478c346ed8c8106a6155.webp",
  "/cgu/1FDBF2AN6VEC67291_461748235_725a472cc3c53688563f3c07811b3cc0_3_0647371b4de74ad3c65a580fb9d44269.webp",
  "/cgu/1FDBF2AN8VEC67325_461748242_725a472cc3c53688563f3c07811b3cc0_3_6a9a895bf26baab285a37fbd5a11eb14.webp",
]);

/** Known source identifiers only; an unrecognized image is not visually verified. */
export function isPlaceholderPhotoUrl(value: string): boolean {
  try {
    let url = new URL(value, "https://local.invalid");
    if (value.startsWith("/api/image/proxy?") && url.searchParams.get("url"))
      url = new URL(url.searchParams.get("url")!, "https://local.invalid");
    if (
      url.hostname === "thumb.autotempest.com" &&
      KNOWN_PLACEHOLDER_PATHS.has(url.pathname)
    )
      return true;
    return /(?:^|\/)(?:no[-_]?image|no[-_]?photo|car-placeholder|placeholder|(?:dealer[-_]|site[-_])?logo|favicon|spacer|loading)(?:[-_]?\d+|[-_](?:dark|light|white|black|small|large))*\.(?:jpe?g|png|webp|gif|svg|ico)$/i.test(
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
