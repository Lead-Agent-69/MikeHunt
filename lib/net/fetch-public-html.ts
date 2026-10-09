import http from "http";
import https from "https";
import axios from "axios";
import {
  UrlNotAllowedError,
  assertPublicHttpUrl,
  resolvePublicAddresses,
} from "@/lib/net/public-url";

const MAX_REDIRECTS = 3;

function publicLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: Error | null,
    address?: string | { address: string; family: number }[],
    family?: number,
  ) => void,
) {
  resolvePublicAddresses(hostname)
    .then((addresses) => {
      const mapped = addresses.map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      }));
      if (options?.all) {
        callback(null, mapped);
        return;
      }
      callback(null, mapped[0].address, mapped[0].family);
    })
    .catch((error: Error) => {
      callback(error);
    });
}

/**
 * Agents whose DNS lookup re-checks every resolved address, so the socket can
 * only connect to a public IP even if DNS changes after assertPublicHttpUrl.
 */
export const publicHttpAgent = new http.Agent({
  keepAlive: false,
  lookup: publicLookup as never,
});
export const publicHttpsAgent = new https.Agent({
  keepAlive: false,
  lookup: publicLookup as never,
});
const httpAgent = publicHttpAgent;
const httpsAgent = publicHttpsAgent;

export function locationHeader(
  headers: Record<string, unknown>,
): string | null {
  const value = headers.location ?? headers.Location;
  if (Array.isArray(value))
    return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
}

/**
 * GET a public http(s) page. Redirects are followed manually and each hop is
 * checked again, so a public URL cannot bounce onto metadata or a private IP.
 * Returns null when the site blocks or errors. Throws UrlNotAllowedError for
 * blocked targets (no fetch is sent to them).
 */
export async function fetchPublicHtml(
  rawUrl: string,
  allowUrl?: (url: string) => Promise<boolean>,
): Promise<{ html: string; finalUrl: string } | null> {
  let current = await assertPublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (allowUrl && !(await allowUrl(current.toString())))
      throw new Error("Page disallowed by source policy");
    let response;
    try {
      response = await axios.get(current.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        timeout: 6000,
        maxRedirects: 0,
        responseType: "text",
        validateStatus: () => true,
        httpAgent,
        httpsAgent,
      });
    } catch (error) {
      if (error instanceof UrlNotAllowedError) throw error;
      return null;
    }

    const status = Number(response.status);
    if (status >= 300 && status < 400) {
      const loc = locationHeader(response.headers || {});
      if (!loc) return null;
      current = await assertPublicHttpUrl(new URL(loc, current).toString());
      continue;
    }
    if (status < 200 || status >= 300) return null;
    const html = typeof response.data === "string" ? response.data : "";
    if (!html.trim()) return null;
    return { html, finalUrl: current.toString() };
  }
  return null;
}
