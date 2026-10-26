import { createHash } from "node:crypto";

const PLACEHOLDER_HASHES = new Set([
  "d99d31a97c71fb1ea1769ba84bfa787a4c54789b4bfcbf3290c83f92cbafe5ef",
  "ef3211bbb7d87a7725d5b7123e1e9282a3187c1851c77d0ef57d9623753f78ab",
]);

/** Exact known bytes only, not AI damage detection or a visual similarity claim. */
export function isPlaceholderPhotoBody(bytes: Uint8Array) {
  return isPlaceholderPhotoFingerprint(
    createHash("sha256").update(bytes).digest("hex"),
  );
}

export function isPlaceholderPhotoFingerprint(digest: string) {
  return PLACEHOLDER_HASHES.has(digest);
}
