import { hostMatches } from "@/lib/net/host-match";
import {
  buyTerms,
  canonicalSource,
  sourceFromUrl,
  sourceMeta,
} from "./source-meta";

const DOMAINS: Record<string, string> = {
  "craigslist.org": "craigslist",
  "copart.com": "copart",
  "iaai.com": "iaa",
  "ebay.com": "ebay_motors",
  "cars.com": "cars_com",
  "autotrader.com": "autotrader",
  "cargurus.com": "cargurus",
  "carvana.com": "carvana",
};

/** Prefer the listing's actual host over an unverified scraper source label. */
export function vendorIdentity(
  source?: string | null,
  sourceUrl?: string | null,
) {
  let url: URL | undefined;
  try {
    const candidate = new URL(String(sourceUrl || ""));
    if (
      ["https:", "http:"].includes(candidate.protocol) &&
      !candidate.username &&
      !candidate.password
    )
      url = candidate;
  } catch {
    // Missing and malformed listing links remain non-interactive labels.
  }
  const host = url?.hostname.toLowerCase().replace(/^www\./, "");
  const knownSource = host
    ? sourceFromUrl(url?.href) ||
      Object.entries(DOMAINS).find(([domain]) => hostMatches(host, domain))?.[1]
    : undefined;
  const key = knownSource || canonicalSource(source);
  const meta = sourceMeta(key);
  return {
    label: host && !knownSource ? host : meta.label,
    host,
    href: url?.href,
    channelLabel: host && !knownSource ? undefined : buyTerms(key).channelTag,
    mark:
      host && hostMatches(host, "craigslist.org")
        ? "/brand/vendors/craigslist.ico"
        : undefined,
  };
}
