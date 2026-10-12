/**
 * Which listing-image hosts /api/image/proxy may re-serve, by the source's access class.
 *
 * The proxy re-publishes bytes from our own origin (CDN-cached for a day, ACAO *). That is a copy of the
 * photo, so it is only allowed for "open" hosts. Hosts whose source is:
 *   - operator_override  crawled only because the operator restored it (OPERATOR_RESTORED_HOSTS, e.g.
 *                        data.rebuildautos.com). The restore is "URL-only rows (no photo copies)".
 *   - needs_permission   a SITE_POLICY_BLOCKS entry of kind needs_permission.
 *   - restricted         any other SITE_POLICY_BLOCKS entry (terms ban bots/copying, bot challenge).
 * get NO proxied bytes. The UI shows the source's own URL instead (lib/image-url.ts), so the visitor's
 * browser loads it from the source directly, or the card's placeholder if the host refuses hotlinks.
 *
 * This never removes or disables a source and never touches its rows; it only stops the proxy copy.
 * It ignores the SCRAPE_TERMS_SAFE_ONLY crawl kill switch: whether a restored host is crawled or not,
 * we never re-serve its photos. Client-safe (no Node APIs).
 */
import {
  OPERATOR_RESTORED_HOSTS,
  SITE_POLICY_BLOCKS,
} from "@/lib/scrapers/source-compliance";

export type ImageProxyAccess =
  | "open"
  | "needs_permission"
  | "restricted"
  | "operator_override";

function under(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Access class of an image URL's host for proxying. Unparseable or non-http(s) URLs are restricted. */
export function imageProxyAccess(
  url: string | null | undefined,
): ImageProxyAccess {
  let host: string;
  try {
    const parsed = new URL(String(url ?? ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return "restricted";
    host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "restricted";
  }
  if (!host) return "restricted";
  if (OPERATOR_RESTORED_HOSTS.some((d) => under(host, d)))
    return "operator_override";
  for (const [domain, block] of Object.entries(SITE_POLICY_BLOCKS)) {
    if (under(host, domain))
      return block.kind === "needs_permission"
        ? "needs_permission"
        : "restricted";
  }
  return "open";
}

/** True only for "open" hosts: the proxy may fetch and re-serve this image's bytes. */
export function imageProxyAllowed(url: string | null | undefined): boolean {
  return imageProxyAccess(url) === "open";
}
