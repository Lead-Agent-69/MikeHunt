import axios from "axios";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import {
  clampBytes,
  locationHeader,
  publicFetchSignal,
} from "@/lib/net/fetch-public-html";
import { pinnedAxiosOptions, resolvePinnedTarget } from "@/lib/net/pinned-dns";

export const MAX_IMAGE_REDIRECTS = 3;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type PublicImageResult =
  | { ok: true; body: Buffer; contentType: string; finalUrl: string }
  | { ok: false; status: number; reason: string };

const IMAGE_TYPE =
  /^image\/(avif|webp|apng|png|jpe?g|pjpeg|gif|bmp|x-icon|vnd\.microsoft\.icon|heic|heif)$/;

/**
 * Normalize an upstream Content-Type to a safe raster image type.
 * SVG (can carry script), HTML, and anything else that isn't a known raster image is refused.
 * application/octet-stream / missing is served as image/jpeg with nosniff on the response.
 */
export function safeImageContentType(
  raw: string | null | undefined,
): string | null {
  const type = String(raw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    !type ||
    type === "application/octet-stream" ||
    type === "binary/octet-stream"
  ) {
    return "image/jpeg";
  }
  return IMAGE_TYPE.test(type) ? type : null;
}

/**
 * GET an image from a public http(s) URL.
 * - Every hop (the first URL and each redirect Location) must pass `isAllowed`
 *   (the caller's host allowlist) AND the pinned public-URL check (no private, loopback,
 *   link-local, metadata, or weird IP encodings).
 * - Redirects are followed manually (axios maxRedirects: 0), capped at MAX_IMAGE_REDIRECTS.
 * - Each hop's host is resolved once, validated and pinned (lib/net/pinned-dns), with proxy: false,
 *   so neither a rebinding answer nor HTTP(S)_PROXY can redirect the socket.
 * Throws UrlNotAllowedError for a blocked hop (no request is sent to it).
 */
export async function fetchPublicImage(
  rawUrl: string,
  isAllowed: (url: string) => boolean,
  headers: Record<string, string> = {},
  options: { signal?: AbortSignal; maxBytes?: number } = {},
): Promise<PublicImageResult> {
  if (!isAllowed(rawUrl)) throw new UrlNotAllowedError("Host not allowed");
  // Resolve once per hop, validate, and pin the socket to that answer.
  let target = await resolvePinnedTarget(rawUrl);
  let current = target.url;
  const signal = publicFetchSignal(options.signal);

  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
    let response;
    try {
      response = await axios.get(current.toString(), {
        headers,
        timeout: 8000,
        signal,
        maxRedirects: 0,
        responseType: "arraybuffer",
        maxContentLength: clampBytes(options.maxBytes, MAX_IMAGE_BYTES),
        validateStatus: () => true,
        ...pinnedAxiosOptions(target),
      });
    } catch (error) {
      if (error instanceof UrlNotAllowedError) throw error;
      if ((error as { cause?: unknown })?.cause instanceof UrlNotAllowedError) {
        throw (error as { cause: UrlNotAllowedError }).cause;
      }
      return { ok: false, status: 502, reason: "upstream fetch failed" };
    }

    const status = Number(response.status);
    if (status >= 300 && status < 400) {
      const loc = locationHeader(response.headers || {});
      if (!loc)
        return { ok: false, status: 502, reason: "redirect without location" };
      const next = new URL(loc, current).toString();
      if (!isAllowed(next))
        throw new UrlNotAllowedError("Redirect host not allowed");
      target = await resolvePinnedTarget(next);
      current = target.url;
      continue;
    }
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        status: status >= 400 && status < 600 ? status : 502,
        reason: "upstream status",
      };
    }
    const contentType = safeImageContentType(
      (response.headers?.["content-type"] as string | undefined) ?? null,
    );
    if (!contentType) return { ok: false, status: 415, reason: "not an image" };
    const body = Buffer.from(response.data as ArrayBuffer);
    return { ok: true, body, contentType, finalUrl: current.toString() };
  }
  return { ok: false, status: 502, reason: "too many redirects" };
}
