// DNS-rebinding-safe outbound requests for user-supplied URLs.
//
// Validating a hostname and then calling fetch() resolves DNS twice; an attacker-controlled resolver
// can answer the second lookup with 127.0.0.1 / 169.254.169.254. Here the hostname is resolved ONCE,
// every address is validated, and the socket is pinned to those addresses through a custom
// `lookup` (no second DNS query). The URL keeps its hostname, so the Host header, TLS SNI and
// certificate verification all still use the real name.
//
// Relative imports only: workers/ runs this outside the Next.js "@/" alias.
import http from "http";
import https from "https";
import type { LookupFunction } from "net";
import {
  UrlNotAllowedError,
  classifyHostname,
  resolvePublicAddresses,
} from "./public-url";

export type PinnedAddress = { address: string; family: 4 | 6 };
export type PinnedTarget = {
  url: URL;
  host: string;
  addresses: PinnedAddress[];
};

const bareHost = (h: string) =>
  h
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");

/**
 * The synchronous part of the URL policy (no DNS): http(s) only, no credentials, no blocked literal
 * host. Throws UrlNotAllowedError. resolvePinnedTarget runs this first.
 */
export function parsePinnableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlNotAllowedError();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new UrlNotAllowedError();
  if (url.username || url.password) throw new UrlNotAllowedError();
  if (classifyHostname(url.hostname) === "blocked")
    throw new UrlNotAllowedError();
  return url;
}

/** Validate the URL, resolve its host exactly once, validate every address, return the pin. */
export async function resolvePinnedTarget(raw: string): Promise<PinnedTarget> {
  const url = parsePinnableUrl(raw);
  // Literal public IP → itself, no DNS. Name → one DNS query; any blocked answer refuses all.
  const addresses = (await resolvePublicAddresses(url.hostname)).map(
    (address) => ({
      address,
      family: (address.includes(":") ? 6 : 4) as 4 | 6,
    }),
  );
  if (!addresses.length) throw new UrlNotAllowedError();
  return { url, host: bareHost(url.hostname), addresses };
}

/** A `lookup` that only ever answers with the pinned, already-validated addresses. */
export function pinnedLookup(target: PinnedTarget): LookupFunction {
  return ((hostname: string, options: any, callback: any) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? {} : options || {};
    if (bareHost(hostname) !== target.host) {
      cb(new UrlNotAllowedError());
      return;
    }
    if (opts.all) {
      cb(null, target.addresses);
      return;
    }
    const first = target.addresses[0];
    cb(null, first.address, first.family);
  }) as LookupFunction;
}

/** One-shot agent (no keep-alive, so a pooled socket can't outlive its pin). */
export function pinnedAgent(target: PinnedTarget): http.Agent {
  const opts = { keepAlive: false, lookup: pinnedLookup(target) };
  return target.url.protocol === "https:"
    ? new https.Agent(opts)
    : new http.Agent(opts);
}

export type PinnedResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  url: string;
};

/** Hard ceiling for one pinned request, connect + headers, regardless of trickle. */
export const PINNED_REQUEST_DEADLINE_MS = 10_000;

/**
 * Single request to a pinned target: no redirect following, and the body is never read (the
 * response is destroyed as soon as headers arrive, so a GET can't stream us an unbounded body).
 * `timeoutMs` is an overall deadline, not just socket idle time. Node's http.request with an
 * explicit agent never consults HTTP(S)_PROXY, so the pin can't be bypassed through a proxy.
 */
export function pinnedRequest(
  target: PinnedTarget,
  init: {
    method?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<PinnedResponse> {
  const mod = target.url.protocol === "https:" ? https : http;
  const deadline = Math.min(init.timeoutMs ?? 5000, PINNED_REQUEST_DEADLINE_MS);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = mod.request(
      target.url,
      {
        method: init.method || "GET",
        agent: pinnedAgent(target),
        headers: init.headers,
        timeout: deadline,
      },
      (res) => {
        const out = {
          status: res.statusCode || 0,
          headers: res.headers,
          url: target.url.toString(),
        };
        // Never read the body: drop the socket.
        res.destroy();
        req.destroy();
        finish(() => resolve(out));
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("pinned request deadline exceeded")),
      deadline,
    );
    req.on("timeout", () => req.destroy(new Error("socket timeout")));
    req.on("error", (err) => finish(() => reject(err)));
    req.end();
  });
}

/** Axios options that route a request through the pin and nowhere else. */
export function pinnedAxiosOptions(target: PinnedTarget) {
  const agent = pinnedAgent(target);
  // proxy: false — axios otherwise honors HTTP(S)_PROXY / an explicit proxy, which would make the
  // proxy (not our pinned lookup) resolve the hostname.
  return { httpAgent: agent, httpsAgent: agent, proxy: false as const };
}
