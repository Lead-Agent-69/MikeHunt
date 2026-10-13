export function sharedListingUrl(
  ...fields: (string | undefined)[]
): string | null {
  for (const field of fields) {
    for (const candidate of field?.match(/https?:\/\/[^\s<>"']+/gi) || []) {
      try {
        const url = new URL(candidate);
        if (
          ["http:", "https:"].includes(url.protocol) &&
          url.hostname &&
          !url.username &&
          !url.password
        )
          return url.href;
      } catch {
        // Share targets can receive prose rather than a complete URL.
      }
    }
  }
  return null;
}
