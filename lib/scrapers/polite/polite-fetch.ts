/**
 * politeFetch — the one way Zeus should touch a third-party site.
 *
 *  - Honest, stable User-Agent with a contact URL (identity.ts). No UA rotation, no fingerprint
 *    spoofing, no proxies, no headless-stealth escalation.
 *  - robots.txt is checked before every URL; Crawl-delay is honored (capped at 60s).
 *  - Per-domain pacing: 1–2 requests in flight, a minimum gap plus jitter (limiter.ts).
 *  - Conditional GETs (ETag / Last-Modified) + a page cache, so unchanged pages cost a 304 (cache.ts).
 *  - 429/503: honor Retry-After, else exponential backoff with jitter (backoff.ts).
 *  - Repeated 403/429, or any bot-challenge page, pauses the whole domain for hours (breaker.ts).
 *    A challenge is a "no" from the site. We never try to get past it.
 *  - Every outcome is counted per domain for the /status ban-risk panel (metrics.ts).
 */
import { DomainBreaker } from "./breaker";
import { isRobotsExemptUrl } from "./robots-exempt";
import {
  backoffMs,
  isBanSignal,
  isRetryableStatus,
  parseRetryAfterMs,
} from "./backoff";
import { conditionalHeaders, defaultPageCache, type PageCache } from "./cache";
import { politeUserAgent } from "./identity";
import { DomainLimiter } from "./limiter";
import { PoliteMetrics } from "./metrics";
import {
  robotsRecordAllows,
  robotsRecordFromBody,
  type RobotsRecord,
} from "./robots";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PoliteFetchOptions {
  /**
   * Skip the robots.txt disallow check for a grandfathered source (Jonah's never-stop-a-working-
   * scraper rule; see robots-exempt.ts). Hosts flagged in the registry or seen producing rows in the
   * last 7 days are exempt automatically. Delays, backoff, breaker and caching still apply.
   */
  robotsExempt?: boolean;
  accept?: string;
  /** HTTP method (default GET). Only bodiless GETs use the conditional cache. */
  method?: string;
  body?: string;
  /**
   * Extra request headers (Content-Type, Referer, ...). User-Agent and browser-fingerprint headers
   * (sec-ch-*, sec-fetch-*) are dropped: we always identify as MikeHunt.
   */
  headers?: Record<string, string>;
  /** Serve from cache without any request when the cached copy is younger than this. */
  freshForMs?: number;
  /** Retries for 429/503/5xx/network errors (not for 403). Default 2. */
  maxRetries?: number;
  /** Longest single wait we will sit through inside one call; longer Retry-After defers the domain. */
  maxRetryWaitMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type PoliteSkipReason = "robots" | "breaker" | "invalid_url";

export interface PoliteResponse {
  url: string;
  status: number;
  body: string;
  ok: boolean;
  fromCache: boolean;
  notModified: boolean;
  /** Not requested at all, and why. */
  skipped?: PoliteSkipReason;
  /** The site served a bot challenge / denial page. The domain is now paused. */
  challenge?: boolean;
  headers?: Record<string, string>;
}

/** Bot-challenge / denial markers. Seeing one means "stop", not "escalate". */
export const CHALLENGE_RE =
  /just a moment\.\.\.|attention required|cf-chl|_cf_chl|challenge-platform|px-captcha|captcha-delivery\.com|pardon our interruption|access to this page has been denied|verify you are (a )?human|_incapsula_resource/i;

/** Caller headers minus anything that would disguise who we are. */
export function honestHeaders(h: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (/^(user-agent|sec-ch-|sec-fetch-|cookie$)/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function looksLikeChallenge(body: string): boolean {
  return CHALLENGE_RE.test(String(body || "").slice(0, 15_000));
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const ROBOTS_TTL_MS = 24 * 60 * 60_000;
export const ROBOTS_RETRY_MS = 30 * 60_000;

interface RobotsEntry {
  record: Promise<RobotsRecord>;
  /** Unset while the fetch is in flight. */
  expiresAt?: number;
}

function setExpiry(map: Map<string, RobotsEntry>, origin: string, at: number) {
  const entry = map.get(origin);
  if (entry) entry.expiresAt = at;
}

export interface PoliteCrawlerDeps {
  fetchImpl?: FetchLike;
  limiter?: DomainLimiter;
  breaker?: DomainBreaker;
  metrics?: PoliteMetrics;
  cache?: PageCache;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export class PoliteCrawler {
  readonly limiter: DomainLimiter;
  readonly breaker: DomainBreaker;
  readonly metrics: PoliteMetrics;
  readonly cache: PageCache;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private robots = new Map<string, RobotsEntry>();

  constructor(deps: PoliteCrawlerDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((u, i) => fetch(u, i));
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.limiter =
      deps.limiter ??
      new DomainLimiter({
        sleep: this.sleep,
        now: this.now,
        random: this.random,
      });
    this.breaker = deps.breaker ?? new DomainBreaker();
    this.metrics = deps.metrics ?? new PoliteMetrics();
    this.cache = deps.cache ?? defaultPageCache();
  }

  private headers(
    extra: Record<string, string> = {},
    accept?: string,
    caller: Record<string, string> = {},
  ) {
    return {
      Accept:
        accept ??
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
      ...honestHeaders(caller),
      ...extra,
      // Last, so nothing can replace it.
      "User-Agent": politeUserAgent(),
    };
  }

  /**
   * robots.txt for an origin, paced like any other request. A readable file is reused for 24h. An
   * unreadable one (5xx, network, 403/429) means "disallow everything" (RFC 9309) and is retried
   * after 30 minutes, so one bad moment doesn't lock a site out for the life of the worker.
   */
  robotsFor(origin: string, domain: string): Promise<RobotsRecord> {
    const hit = this.robots.get(origin);
    if (hit && (hit.expiresAt === undefined || hit.expiresAt > this.now()))
      return hit.record;
    const startedAt = this.now();
    const pending = this.limiter
      .run(domain, async () => {
        try {
          const res = await this.fetchImpl(`${origin}/robots.txt`, {
            headers: this.headers({}, "text/plain,*/*;q=0.5"),
            signal: AbortSignal.timeout(15_000),
            redirect: "follow",
          });
          this.metrics.recordStatus(domain, res.status);
          if (isBanSignal(res.status)) {
            this.breaker.recordBanSignal(domain, res.status, this.now());
            return null; // a 403/429 on robots.txt means "go away"
          }
          if (res.status >= 500) return null;
          if (res.status >= 400) return ""; // no robots.txt → everything allowed
          return await res.text();
        } catch {
          this.metrics.recordNetworkError(domain);
          return null;
        }
      })
      .then((body) => {
        const rec = robotsRecordFromBody(body);
        this.limiter.setCrawlDelay(domain, rec.crawlDelaySec);
        const ttl = rec.body === null ? ROBOTS_RETRY_MS : ROBOTS_TTL_MS;
        setExpiry(this.robots, origin, startedAt + ttl);
        return rec;
      });
    this.robots.set(origin, { record: pending });
    return pending;
  }

  async fetch(
    url: string,
    opts: PoliteFetchOptions = {},
  ): Promise<PoliteResponse> {
    const domain = domainOf(url);
    const base: PoliteResponse = {
      url,
      status: 0,
      body: "",
      ok: false,
      fromCache: false,
      notModified: false,
    };
    if (!domain) return { ...base, skipped: "invalid_url" };
    const origin = new URL(url).origin;

    if (this.breaker.isOpen(domain, this.now())) {
      this.metrics.recordBreakerSkip(domain);
      return { ...base, skipped: "breaker" };
    }

    if (!(opts.robotsExempt || isRobotsExemptUrl(url))) {
      const robots = await this.robotsFor(origin, domain);
      if (!robotsRecordAllows(robots, url)) {
        this.metrics.recordRobotsDenied(domain);
        return { ...base, skipped: "robots" };
      }
    }

    const method = (opts.method || "GET").toUpperCase();
    const cacheable = method === "GET" && opts.body == null;
    const cached = cacheable ? this.cache.get(url) : undefined;
    if (
      cached &&
      opts.freshForMs &&
      this.now() - cached.fetchedAt < opts.freshForMs
    ) {
      return {
        ...base,
        status: cached.status,
        body: cached.body,
        ok: true,
        fromCache: true,
      };
    }

    const maxRetries = opts.maxRetries ?? 2;
    const maxWait = opts.maxRetryWaitMs ?? 60_000;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      opts.signal?.throwIfAborted();
      if (this.breaker.isOpen(domain, this.now())) {
        this.metrics.recordBreakerSkip(domain);
        return { ...base, skipped: "breaker" };
      }
      let res: Response;
      try {
        res = await this.limiter.run(domain, () =>
          this.fetchImpl(url, {
            method,
            ...(opts.body != null ? { body: opts.body } : {}),
            headers: this.headers(
              conditionalHeaders(cached),
              opts.accept,
              opts.headers,
            ),
            signal: opts.signal
              ? AbortSignal.any([
                  opts.signal,
                  AbortSignal.timeout(opts.timeoutMs ?? 20_000),
                ])
              : AbortSignal.timeout(opts.timeoutMs ?? 20_000),
            redirect: "follow",
          }),
        );
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        this.metrics.recordNetworkError(domain);
        if (attempt > maxRetries) return base;
        await this.sleep(backoffMs(attempt, { random: this.random }));
        continue;
      }

      const status = res.status;
      this.metrics.recordStatus(domain, status);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });

      if (status === 304 && cached) {
        this.breaker.recordSuccess(domain);
        this.cache.set({ ...cached, fetchedAt: this.now() });
        return {
          ...base,
          status: 200,
          body: cached.body,
          ok: true,
          fromCache: true,
          notModified: true,
          headers,
        };
      }

      if (status >= 200 && status < 300) {
        const body = await res.text();
        if (looksLikeChallenge(body)) {
          this.metrics.recordChallenge(domain);
          this.breaker.pause(domain, "bot challenge page", this.now(), challengeBackoffMs());
          return { ...base, status, challenge: true, headers };
        }
        this.breaker.recordSuccess(domain);
        if (cacheable)
          this.cache.set({
          url,
          status,
          body,
          etag: headers["etag"],
          lastModified: headers["last-modified"],
          fetchedAt: this.now(),
        });
        return { ...base, status, body, ok: true, headers };
      }

      if (isBanSignal(status)) {
        this.breaker.recordBanSignal(domain, status, this.now());
      }
      const body = await res.text().catch(() => "");
      if (status === 403) {
        if (looksLikeChallenge(body)) {
          this.metrics.recordChallenge(domain);
          this.breaker.pause(domain, "bot challenge page", this.now(), challengeBackoffMs());
          return { ...base, status, challenge: true, headers };
        }
        return { ...base, status, headers };
      }
      const retryable = isRetryableStatus(status) || status >= 500;
      if (!retryable || attempt > maxRetries)
        return { ...base, status, headers };
      const retryAfter = parseRetryAfterMs(headers["retry-after"], this.now());
      const wait = retryAfter ?? backoffMs(attempt, { random: this.random });
      if (wait > maxWait) {
        // The site asked for a long pause: leave the domain alone until then.
        this.limiter.deferUntil(domain, this.now() + wait);
        return { ...base, status, headers };
      }
      this.limiter.deferUntil(domain, this.now() + wait);
    }
    return base;
  }

  snapshot() {
    return this.metrics.snapshot(this.breaker.snapshot(this.now()));
  }
}

let shared: PoliteCrawler | null = null;

/** Process-wide crawler: one limiter/breaker/cache per worker so all sources share the pacing. */
export function politeCrawler(): PoliteCrawler {
  if (!shared) shared = new PoliteCrawler();
  return shared;
}

export function politeFetch(url: string, opts?: PoliteFetchOptions) {
  return politeCrawler().fetch(url, opts);
}

/** Ban-risk snapshot for this worker (attach to scrape_jobs.result → /status). */
export function politeMetricsSnapshot() {
  return politeCrawler().snapshot();
}

/**
 * Polite mode is the DEFAULT for every scraper: the engine, smartFetch and every direct source
 * fetch (scraperFetch) go through politeFetch. Opt out per worker with SCRAPER_POLITE_MODE=0
 * (also "off" / "false"), which restores the legacy fetch paths unchanged.
 */
/**
 * A bot-challenge page is recorded as a "challenged" outcome (metrics.challenges, shown on /status)
 * and backs the domain off briefly. It is NOT a permanent skip: the default 30 minutes is shorter
 * than the sweep interval (4h), so the source is retried on its next schedule.
 */
export function challengeBackoffMs(): number {
  const min = Number(process.env.POLITE_CHALLENGE_BACKOFF_MIN);
  return (Number.isFinite(min) && min >= 0 ? Math.min(min, 120) : 30) * 60_000;
}

/** Polite robots path for this URL: polite mode on and the host is not grandfathered. */
export function politeRobotsPathFor(url: string): boolean {
  return politeModeEnabled() && !isRobotsExemptUrl(url);
}

/**
 * Run a grandfathered source's own legacy request (FlareSolverr, browser, curl, axios...) exactly as
 * before, with only the polite layer around it: the per-domain random delay and concurrency slot,
 * the circuit breaker (a paused domain throws instead of being hit), and ban/challenge accounting
 * from the returned status. Outside polite mode it just runs `fn`.
 */
export async function politeGate<T>(
  url: string,
  fn: () => Promise<T>,
  statusOf?: (result: T) => number | undefined,
): Promise<T> {
  if (!politeModeEnabled()) return fn();
  const domain = domainOf(url);
  if (!domain) return fn();
  const c = politeCrawler();
  if (c.breaker.isOpen(domain)) {
    c.metrics.recordBreakerSkip(domain);
    throw new Error(`polite: ${domain} paused by circuit breaker (retried next schedule)`);
  }
  let result: T;
  try {
    result = await c.limiter.run(domain, fn);
  } catch (error) {
    c.metrics.recordNetworkError(domain);
    throw error;
  }
  const status = statusOf?.(result);
  if (status !== undefined) {
    c.metrics.recordStatus(domain, status);
    if (status === 403 || status === 429) c.breaker.recordBanSignal(domain, status);
    else if (status >= 200 && status < 400) c.breaker.recordSuccess(domain);
  } else {
    c.metrics.recordStatus(domain, 200);
  }
  return result;
}

export function politeModeEnabled(): boolean {
  const v = String(process.env.SCRAPER_POLITE_MODE ?? "")
    .trim()
    .toLowerCase();
  return !(v === "0" || v === "off" || v === "false" || v === "no");
}

/** Tests only. */
export function resetPoliteCrawler(next?: PoliteCrawler) {
  shared = next ?? null;
}
