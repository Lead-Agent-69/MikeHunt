import { describe, it, expect, vi } from "vitest";

// Tests run offline on made-up hosts: the per-hop public-address check keeps its literal-IP /
// localhost rules but skips the DNS lookup.
vi.mock("../../net/public-url", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../net/public-url")>();
  return {
    ...m,
    assertPublicHttpUrl: async (raw: string) => {
      const u = new URL(raw);
      if (m.classifyHostname(u.hostname) === "blocked")
        throw new m.UrlNotAllowedError();
      return u;
    },
  };
});
import {
  backoffMs,
  isBanSignal,
  isRetryableStatus,
  parseRetryAfterMs,
} from "./backoff";
import { DomainBreaker } from "./breaker";
import { MemoryPageCache, conditionalHeaders } from "./cache";
import { BOT_TOKEN, politeUserAgent } from "./identity";
import { DomainLimiter, MAX_DOMAIN_CONCURRENCY } from "./limiter";
import { PoliteMetrics, banRisk } from "./metrics";
import {
  PoliteCrawler,
  ROBOTS_RETRY_MS,
  looksLikeChallenge,
  type FetchLike,
} from "./polite-fetch";
import {
  robotsCrawlDelaySeconds,
  robotsRecordAllows,
  robotsRecordFromBody,
} from "./robots";
import { isOffPeak, isSourceDue, shouldCrawlNow } from "./schedule";

describe("identity", () => {
  it("is an honest, stable UA with a contact URL", () => {
    const ua = politeUserAgent();
    expect(ua).toContain(BOT_TOKEN);
    expect(ua).toMatch(/\+https?:\/\//);
    expect(ua).not.toMatch(/Chrome|Safari|Gecko|Mozilla\/5\.0 \(Windows/);
    expect(politeUserAgent()).toBe(ua);
  });
});

describe("backoff", () => {
  it("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(parseRetryAfterMs("Fri, 09 Oct 2026 12:00:30 GMT", now)).toBe(
      30_000,
    );
    expect(parseRetryAfterMs("soon")).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });

  it("grows exponentially with bounded jitter and a cap", () => {
    expect(backoffMs(1, { random: () => 0 })).toBe(5_000);
    expect(backoffMs(2, { random: () => 0 })).toBe(10_000);
    expect(backoffMs(2, { random: () => 1 })).toBe(15_000);
    expect(backoffMs(20, { random: () => 1 })).toBe(300_000);
  });

  it("classifies statuses", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isBanSignal(403)).toBe(true);
    expect(isBanSignal(503)).toBe(false);
  });
});

describe("DomainBreaker", () => {
  it("opens for hours after repeated 403/429 in the window", () => {
    const b = new DomainBreaker({
      threshold: 3,
      windowMs: 60_000,
      pauseMs: 6 * 3600_000,
    });
    expect(b.recordBanSignal("a.com", 429, 0)).toBe(false);
    expect(b.recordBanSignal("a.com", 403, 1_000)).toBe(false);
    expect(b.recordBanSignal("a.com", 429, 2_000)).toBe(true);
    expect(b.isOpen("a.com", 3_000)).toBe(true);
    expect(b.isOpen("a.com", 2_000 + 6 * 3600_000 + 1)).toBe(false);
    expect(b.isOpen("b.com", 3_000)).toBe(false);
  });

  it("forgets strikes outside the window and on success", () => {
    const b = new DomainBreaker({ threshold: 2, windowMs: 1_000 });
    b.recordBanSignal("a.com", 403, 0);
    expect(b.recordBanSignal("a.com", 403, 5_000)).toBe(false);
    b.recordSuccess("a.com");
    expect(b.recordBanSignal("a.com", 403, 5_100)).toBe(false);
  });
});

describe("DomainLimiter", () => {
  it("never allows more than 2 in flight even if asked", () => {
    expect(new DomainLimiter({ maxConcurrent: 10 }).maxConcurrent).toBe(
      MAX_DOMAIN_CONCURRENCY,
    );
    expect(new DomainLimiter({ maxConcurrent: 0 }).maxConcurrent).toBe(1);
  });

  it("serializes a domain at concurrency 1 and spaces starts by the gap + jitter", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const lim = new DomainLimiter({
      maxConcurrent: 1,
      minGapMs: 1_000,
      jitterRatio: 0.5,
      random: () => 0.5,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
    };
    await Promise.all([
      lim.run("a.com", task),
      lim.run("a.com", task),
      lim.run("a.com", task),
    ]);
    expect(peak).toBe(1);
    // First touch is staggered by 0.5 × 50% of the gap; then gap + jitter.
    expect(sleeps).toEqual([250, 1_250, 1_250]);
  });

  it("honors Crawl-delay above the minimum gap (capped at 60s)", () => {
    const lim = new DomainLimiter({ minGapMs: 1_000, jitterRatio: 0 });
    lim.setCrawlDelay("a.com", 10);
    expect(lim.gapMs("a.com")).toBe(10_000);
    lim.setCrawlDelay("a.com", 3_600);
    expect(lim.gapMs("a.com")).toBe(60_000);
    expect(lim.gapMs("b.com")).toBe(1_000);
  });
});

describe("robots", () => {
  const body = [
    "User-agent: *",
    "Crawl-delay: 5",
    "Disallow: /private",
    "",
    "User-agent: MikeHuntBot",
    "Crawl-delay: 2",
    "Disallow: /no-bots",
    "Sitemap: https://x.com/sitemap.xml",
  ].join("\n");

  it("uses our own group's Crawl-delay over *", () => {
    expect(robotsCrawlDelaySeconds(body)).toBe(2);
    expect(robotsCrawlDelaySeconds("User-agent: *\nCrawl-delay: 7")).toBe(7);
    expect(robotsCrawlDelaySeconds("User-agent: *\nDisallow:")).toBeNull();
  });

  it("collects sitemaps and enforces rules; unreadable robots disallows all", () => {
    const rec = robotsRecordFromBody(body);
    expect(rec.sitemaps).toEqual(["https://x.com/sitemap.xml"]);
    expect(robotsRecordAllows(rec, "https://x.com/no-bots/1")).toBe(false);
    expect(robotsRecordAllows(rec, "https://x.com/inventory")).toBe(true);
    expect(
      robotsRecordAllows(robotsRecordFromBody(null), "https://x.com/"),
    ).toBe(false);
    expect(robotsRecordAllows(robotsRecordFromBody(""), "https://x.com/")).toBe(
      true,
    );
  });
});

describe("cache + metrics", () => {
  it("builds conditional headers", () => {
    expect(conditionalHeaders(undefined)).toEqual({});
    expect(
      conditionalHeaders({
        url: "u",
        status: 200,
        body: "",
        etag: '"abc"',
        lastModified: "Wed, 01 Oct 2026 00:00:00 GMT",
        fetchedAt: 0,
      }),
    ).toEqual({
      "If-None-Match": '"abc"',
      "If-Modified-Since": "Wed, 01 Oct 2026 00:00:00 GMT",
    });
  });

  it("computes ban risk as (403+429)/requests", () => {
    const m = new PoliteMetrics();
    m.recordStatus("a.com", 200);
    m.recordStatus("a.com", 403);
    m.recordStatus("a.com", 429);
    m.recordStatus("a.com", 304);
    expect(banRisk({ requests: 4, forbidden: 1, tooMany: 1 })).toBe(0.5);
    const snap = m.snapshot([]);
    expect(snap.requests).toBe(4);
    expect(snap.banRiskPct).toBe(50);
    expect(snap.rate403Pct).toBe(25);
    expect(snap.cacheHitPct).toBe(25);
  });

  it("recognizes bot challenge pages", () => {
    expect(looksLikeChallenge("<title>Just a moment...</title>")).toBe(true);
    expect(looksLikeChallenge("<div id=px-captcha>")).toBe(true);
    expect(looksLikeChallenge("<h1>2019 Honda Civic</h1>")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function harness(route: Route, robots = "User-agent: *\nDisallow: /private") {
  let clock = 1_000_000;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: { ...(init?.headers as Record<string, string>) },
    });
    if (url.endsWith("/robots.txt"))
      return new Response(robots, { status: 200 });
    return route(url, init);
  };
  const sleep = async (ms: number) => {
    clock += ms;
  };
  const crawler = new PoliteCrawler({
    fetchImpl,
    sleep,
    now: () => clock,
    random: () => 0,
    cache: new MemoryPageCache(),
    breaker: new DomainBreaker({ threshold: 3, pauseMs: 6 * 3600_000 }),
    limiter: new DomainLimiter({
      minGapMs: 0,
      now: () => clock,
      sleep,
      random: () => 0,
    }),
  });
  return {
    crawler,
    calls,
    advance: (ms: number) => (clock += ms),
    now: () => clock,
  };
}

describe("PoliteCrawler", () => {
  it("sends the honest UA and caches robots.txt", async () => {
    const h = harness(() => new Response("<h1>ok</h1>", { status: 200 }));
    await h.crawler.fetch("https://dealer.com/a");
    await h.crawler.fetch("https://dealer.com/b");
    expect(h.calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(
      1,
    );
    expect(
      h.calls.every((c) => c.headers["User-Agent"] === politeUserAgent()),
    ).toBe(true);
  });

  it("never requests a robots-disallowed URL", async () => {
    const h = harness(() => new Response("x"));
    const r = await h.crawler.fetch("https://dealer.com/private/1");
    expect(r.skipped).toBe("robots");
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://dealer.com/robots.txt",
    ]);
  });

  it("re-reads an unreadable robots.txt after 30 minutes", async () => {
    let robotsStatus = 503;
    let clock = 0;
    const fetchImpl: FetchLike = async (url) =>
      url.endsWith("/robots.txt")
        ? new Response("", { status: robotsStatus })
        : new Response("ok");
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const crawler = new PoliteCrawler({
      fetchImpl,
      sleep,
      now: () => clock,
      cache: new MemoryPageCache(),
      limiter: new DomainLimiter({ minGapMs: 0, now: () => clock, sleep }),
    });
    expect((await crawler.fetch("https://d.com/a")).skipped).toBe("robots");
    robotsStatus = 404;
    expect((await crawler.fetch("https://d.com/a")).skipped).toBe("robots");
    clock += ROBOTS_RETRY_MS + 1;
    expect((await crawler.fetch("https://d.com/a")).ok).toBe(true);
  });

  it("uses ETag/Last-Modified and serves a 304 from cache", async () => {
    let n = 0;
    const h = harness((_, init) => {
      n++;
      const hdrs = init?.headers as Record<string, string>;
      if (hdrs["If-None-Match"] === '"v1"')
        return new Response(null, { status: 304 });
      return new Response("<h1>page</h1>", {
        status: 200,
        headers: { etag: '"v1"' },
      });
    });
    const first = await h.crawler.fetch("https://dealer.com/inv");
    const second = await h.crawler.fetch("https://dealer.com/inv");
    expect(first.body).toBe("<h1>page</h1>");
    expect(second.notModified).toBe(true);
    expect(second.body).toBe("<h1>page</h1>");
    expect(n).toBe(2);
  });

  it("skips the network entirely when the cached copy is fresh enough", async () => {
    let n = 0;
    const h = harness(() => {
      n++;
      return new Response("p");
    });
    await h.crawler.fetch("https://dealer.com/inv");
    const again = await h.crawler.fetch("https://dealer.com/inv", {
      freshForMs: 60_000,
    });
    expect(again.fromCache).toBe(true);
    expect(n).toBe(1);
  });

  it("honors Retry-After on 429 and then succeeds", async () => {
    let n = 0;
    const h = harness(() =>
      ++n === 1
        ? new Response("slow down", {
            status: 429,
            headers: { "retry-after": "7" },
          })
        : new Response("ok"),
    );
    const start = h.now();
    const r = await h.crawler.fetch("https://dealer.com/x");
    expect(r.ok).toBe(true);
    expect(h.now() - start).toBeGreaterThanOrEqual(7_000);
  });

  it("gives up (and defers the domain) when Retry-After is longer than we will wait", async () => {
    const h = harness(
      () =>
        new Response("", { status: 503, headers: { "retry-after": "3600" } }),
    );
    const r = await h.crawler.fetch("https://dealer.com/x");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it("opens the breaker after repeated 403s and stops sending", async () => {
    let n = 0;
    const h = harness(() => {
      n++;
      return new Response("denied", { status: 403 });
    });
    for (let i = 0; i < 3; i++)
      await h.crawler.fetch(`https://dealer.com/p${i}`);
    const r = await h.crawler.fetch("https://dealer.com/p9");
    expect(r.skipped).toBe("breaker");
    expect(n).toBe(3);
    expect(h.crawler.snapshot().pausedDomains.map((p) => p.domain)).toEqual([
      "dealer.com",
    ]);
  });

  it("treats a bot challenge as a stop sign, not something to get past", async () => {
    let n = 0;
    const h = harness(() => {
      n++;
      return new Response("<title>Just a moment...</title>", { status: 200 });
    });
    const r = await h.crawler.fetch("https://dealer.com/x");
    expect(r.challenge).toBe(true);
    expect(r.ok).toBe(false);
    expect((await h.crawler.fetch("https://dealer.com/y")).skipped).toBe(
      "breaker",
    );
    expect(n).toBe(1);
  });
});

describe("schedule", () => {
  it("only refetches at each source's freshness", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    expect(isSourceDue("gsa_auctions", now - 5 * 3600_000, now)).toBe(false);
    expect(isSourceDue("gsa_auctions", now - 7 * 3600_000, now)).toBe(true);
    expect(isSourceDue("anything", null, now)).toBe(true);
  });

  it("knows off-peak hours in US Central, across midnight", () => {
    // 23:00 CDT = 04:00Z next day; 14:00 CDT = 19:00Z
    expect(isOffPeak(Date.parse("2026-10-10T04:00:00Z"))).toBe(true);
    expect(isOffPeak(Date.parse("2026-10-09T19:00:00Z"))).toBe(false);
  });

  it("lets brand-new sources run any time but holds refreshes for off-peak", () => {
    const peak = Date.parse("2026-10-09T19:00:00Z");
    expect(shouldCrawlNow("curated_dealers", null, peak, true)).toBe(true);
    expect(
      shouldCrawlNow("curated_dealers", peak - 10 * 3600_000, peak, true),
    ).toBe(false);
    expect(
      shouldCrawlNow("curated_dealers", peak - 10 * 3600_000, peak, false),
    ).toBe(true);
  });
});
