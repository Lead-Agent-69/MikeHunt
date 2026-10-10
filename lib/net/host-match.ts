// lib/net/host-match.ts
//
// Match a URL to a site by its HOSTNAME, never by a substring of the whole URL.
// `url.includes("copart.com")` is true for https://attacker.example/lot/123?copart.com and
// `url.includes("cars.com")` is true for classiccars.com, so substring checks let any page claim
// to be a trusted source. Pure and client-safe (no Node imports).

/**
 * Lowercased hostname of an http(s) URL, without a trailing dot. A bare host or a scheme-less
 * "host/path" string is accepted. Returns null for anything that does not parse or is not http(s).
 */
export function hostOf(url?: string | null): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  return host || null;
}

/** True when `host` is `domain` itself or a subdomain of it (dot-suffix). */
export function hostMatches(
  host: string | null | undefined,
  domain: string,
): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/\.+$/, "");
  const d = domain.toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/** True when the URL's hostname is any of `domains` or a subdomain of one. */
export function urlHostMatches(
  url: string | null | undefined,
  domains: readonly string[],
): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return domains.some((domain) => hostMatches(host, domain));
}
