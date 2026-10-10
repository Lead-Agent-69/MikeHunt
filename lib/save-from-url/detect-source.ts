import { hostMatches, hostOf } from "@/lib/net/host-match";

// Hostname → source. Matched on the parsed hostname (exact or dot-suffix), never on a substring
// of the whole URL: https://attacker.example/lot/<real lot>?copart.com must not become "copart"
// (the upsert key is source + source_deal_id, so that would overwrite the real Copart row), and
// classiccars.com is not cars.com.
const SOURCE_HOSTS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["craigslist", ["craigslist.org"]],
  ["facebook-marketplace", ["facebook.com"]],
  ["copart", ["copart.com"]],
  ["iaa", ["iaai.com"]],
  ["ebay-motors", ["ebay.com", "ebay.to"]],
  ["autotrader", ["autotrader.com"]],
  ["cars-com", ["cars.com"]],
  ["cargurus", ["cargurus.com"]],
  ["carmax", ["carmax.com"]],
  ["carvana", ["carvana.com"]],
];

/**
 * Named source for a URL's host, or "web-share" for any other http(s) host (stored as the generic
 * independent_dealer bucket, never guessed as a named marketplace). null when the URL does not
 * parse as http(s); the route rejects that with 400.
 */
export function detectSource(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const [source, domains] of SOURCE_HOSTS) {
    if (domains.some((domain) => hostMatches(host, domain))) return source;
  }
  return "web-share";
}
