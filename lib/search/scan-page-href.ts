/**
 * Turn the Scan data key (`/api/scan?...`) into the buyer-facing page URL
 * (`/scan?...`) with the same filters. Links must never point at the JSON API.
 */
export function scanPageHrefFromApiKey(
  apiKey: string | null | undefined,
  fallback = "/scan",
): string {
  if (!apiKey) return fallback;
  const queryIndex = apiKey.indexOf("?");
  const query = queryIndex === -1 ? "" : apiKey.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  params.delete("page");
  const qs = params.toString();
  return qs ? `/scan?${qs}` : "/scan";
}
