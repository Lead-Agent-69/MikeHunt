import { afterEach, describe, expect, it, vi } from "vitest";

// Tests run offline on made-up hosts: the per-hop public-address check keeps its literal-IP /
// localhost rules but skips the DNS lookup.
vi.mock("../../net/public-url", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../net/public-url")>();
  return {
    ...m,
    assertPublicHttpUrl: async (raw: string) => {
      const u = new URL(raw);
      if (m.classifyHostname(u.hostname) === "blocked") throw new m.UrlNotAllowedError();
      return u;
    },
  };
});
import { DomainLimiter } from "./limiter";
import { PoliteCrawler, politeModeEnabled, resetPoliteCrawler, honestHeaders } from "./polite-fetch";
import { scraperFetch, POLITE_SKIP_STATUS } from "./scraper-fetch";
import { MemoryPageCache } from "./cache";

const prev = process.env.SCRAPER_POLITE_MODE;
afterEach(() => {
  if (prev === undefined) delete process.env.SCRAPER_POLITE_MODE;
  else process.env.SCRAPER_POLITE_MODE = prev;
  resetPoliteCrawler();
});

function crawler(routes: Record<string, (init?: RequestInit) => Response>, seen: { url: string; init?: RequestInit }[]) {
  return new PoliteCrawler({
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      const path = new URL(url).pathname;
      const h = routes[path];
      return h ? h(init) : new Response("", { status: 404 });
    },
    sleep: async () => {},
    random: () => 0.5,
    limiter: new DomainLimiter({ sleep: async () => {}, minGapMs: 0 }),
    cache: new MemoryPageCache(),
  });
}

describe("polite mode is the default", () => {
  it("is on unless SCRAPER_POLITE_MODE opts out", () => {
    delete process.env.SCRAPER_POLITE_MODE;
    expect(politeModeEnabled()).toBe(true);
    process.env.SCRAPER_POLITE_MODE = "1";
    expect(politeModeEnabled()).toBe(true);
    for (const off of ["0", "off", "false", "no"]) {
      process.env.SCRAPER_POLITE_MODE = off;
      expect(politeModeEnabled()).toBe(false);
    }
  });

  it("drops disguising headers and always sends the honest UA", () => {
    expect(
      honestHeaders({
        "User-Agent": "Mozilla/5.0 Chrome",
        "sec-ch-ua": "x",
        "Sec-Fetch-Mode": "cors",
        Cookie: "a=b",
        Referer: "https://example.com/",
        "Content-Type": "application/json",
      }),
    ).toEqual({ Referer: "https://example.com/", "Content-Type": "application/json" });
  });

  it("scraperFetch: robots-disallowed URL is a 599 skip, never requested", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const seen: { url: string; init?: RequestInit }[] = [];
    resetPoliteCrawler(
      crawler({ "/robots.txt": () => new Response("User-agent: *\nDisallow: /api/") }, seen),
    );
    const res = await scraperFetch("https://site.example/api/search", {
      method: "POST",
      body: "{}",
      headers: { "User-Agent": "Mozilla/5.0 fake" },
    });
    expect(res.status).toBe(POLITE_SKIP_STATUS);
    expect(res.headers.get("x-polite-skipped")).toBe("robots");
    expect(seen.map((s) => new URL(s.url).pathname)).toEqual(["/robots.txt"]);
  });

  it("scraperFetch: POST goes through with body, honest UA and caller's content headers", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const seen: { url: string; init?: RequestInit }[] = [];
    resetPoliteCrawler(
      crawler(
        {
          "/robots.txt": () => new Response("User-agent: *\nAllow: /"),
          "/lots": () => new Response('{"ok":1}', { status: 200, headers: { "content-type": "application/json" } }),
        },
        seen,
      ),
    );
    const res = await scraperFetch("https://site.example/lots", {
      method: "POST",
      body: '{"page":1}',
      headers: { "User-Agent": "Mozilla/5.0 fake", "Content-Type": "application/json", Accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: 1 });
    const call = seen.find((s) => s.url.endsWith("/lots"))!;
    const h = call.init!.headers as Record<string, string>;
    expect(call.init!.method).toBe("POST");
    expect(call.init!.body).toBe('{"page":1}');
    expect(h["User-Agent"]).toMatch(/MikeHunt/i);
    expect(h["content-type"]).toBe("application/json");
    expect(h.Accept).toBe("application/json");
  });

  it("scraperFetch is plain fetch when opted out", async () => {
    process.env.SCRAPER_POLITE_MODE = "0";
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("hi"));
    const res = await scraperFetch("https://site.example/x", { headers: { "User-Agent": "legacy" } });
    expect(await res.text()).toBe("hi");
    expect(spy).toHaveBeenCalledWith("https://site.example/x", { headers: { "User-Agent": "legacy" } });
    spy.mockRestore();
  });
});

describe("randomized per-domain delays", () => {
  it("every gap is base..2×base (default jitter), and varies with the random draw", () => {
    const lo = new DomainLimiter({ minGapMs: 1000, random: () => 0 });
    const hi = new DomainLimiter({ minGapMs: 1000, random: () => 0.999 });
    expect(lo.gapMs("a.com")).toBe(1000);
    expect(hi.gapMs("a.com")).toBe(1999);
  });

  it("Crawl-delay raises the base for that domain only", () => {
    const l = new DomainLimiter({ minGapMs: 1000, random: () => 0 });
    l.setCrawlDelay("slow.com", 10);
    expect(l.gapMs("slow.com")).toBe(10_000);
    expect(l.gapMs("fast.com")).toBe(1000);
  });

  it("the first request to a domain is staggered, later ones paced", async () => {
    let now = 0;
    const waits: number[] = [];
    const l = new DomainLimiter({
      minGapMs: 1000,
      random: () => 0.5,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await l.run("a.com", async () => 1);
    await l.run("a.com", async () => 2);
    expect(waits[0]).toBe(250); // 0.5 × 50% of 1000
    expect(waits[1]).toBe(1500); // 1000 + 50% jitter
  });
});
