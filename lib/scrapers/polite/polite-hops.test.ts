import { describe, expect, it } from "vitest";
import { DomainLimiter } from "./limiter";
import { MemoryPageCache } from "./cache";
import {
  PoliteCrawler,
  readCapped,
  ResponseTooLargeError,
} from "./polite-fetch";
import { UrlNotAllowedError, classifyHostname } from "../../net/public-url";

// Ren #321 nits: response size cap + public-address check on every redirect hop.
const PRIVATE = new Set(["internal.example", "169.254.169.254", "127.0.0.1"]);
async function checkHost(raw: string) {
  const u = new URL(raw);
  if (PRIVATE.has(u.hostname) || classifyHostname(u.hostname) === "blocked")
    throw new UrlNotAllowedError();
}

function crawler(routes: Record<string, () => Response>, seen: string[]) {
  return new PoliteCrawler({
    fetchImpl: async (url, init) => {
      seen.push(url);
      expect(init?.redirect).toBe("manual");
      const r = routes[new URL(url).hostname + new URL(url).pathname];
      return r ? r() : new Response("", { status: 404 });
    },
    sleep: async () => {},
    limiter: new DomainLimiter({
      sleep: async () => {},
      minGapMs: 0,
      jitterRatio: 0,
      domainFloorMs: () => 0,
    }),
    cache: new MemoryPageCache(),
    checkHost,
  });
}

describe("politeFetch redirect hops", () => {
  it("refuses a redirect onto a private address without requesting it", async () => {
    const seen: string[] = [];
    const c = crawler(
      {
        "site.example/robots.txt": () => new Response(""),
        "site.example/a": () =>
          new Response("", {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data" },
          }),
      },
      seen,
    );
    const res = await c.fetch("https://site.example/a", { maxRetries: 0 });
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe("blocked_host");
    expect(seen.some((u) => u.includes("169.254.169.254"))).toBe(false);
  });

  it("refuses a first URL on a private host before any request (robots.txt included)", async () => {
    const seen: string[] = [];
    const c = crawler({}, seen);
    expect((await c.fetch("https://internal.example/x")).skipped).toBe(
      "blocked_host",
    );
    expect(seen).toEqual([]);
  });

  it("follows a public redirect hop and returns the final page", async () => {
    const seen: string[] = [];
    const c = crawler(
      {
        "site.example/robots.txt": () => new Response(""),
        "site.example/a": () =>
          new Response("", { status: 301, headers: { location: "/b" } }),
        "site.example/b": () =>
          new Response("<html>ok</html>", { status: 200 }),
      },
      seen,
    );
    const res = await c.fetch("https://site.example/a");
    expect(res.ok).toBe(true);
    expect(res.body).toContain("ok");
    expect(seen.filter((u) => !u.endsWith("/robots.txt"))).toEqual([
      "https://site.example/a",
      "https://site.example/b",
    ]);
  });
});

describe("politeFetch size cap", () => {
  it("drops a body over maxBytes (declared or streamed) and keeps one under it", async () => {
    const seen: string[] = [];
    const big = "x".repeat(2048);
    const c = crawler(
      {
        "site.example/robots.txt": () => new Response(""),
        "site.example/big": () => new Response(big, { status: 200 }),
        "site.example/small": () => new Response("small", { status: 200 }),
      },
      seen,
    );
    const over = await c.fetch("https://site.example/big", { maxBytes: 1024 });
    expect(over).toMatchObject({ ok: false, tooLarge: true, body: "" });
    const under = await c.fetch("https://site.example/small", {
      maxBytes: 1024,
    });
    expect(under).toMatchObject({ ok: true, body: "small" });
  });

  it("readCapped trusts neither side alone: a lying Content-Length still stops at the cap", async () => {
    const stream = new ReadableStream({
      start(ctl) {
        ctl.enqueue(new TextEncoder().encode("a".repeat(600)));
        ctl.enqueue(new TextEncoder().encode("b".repeat(600)));
        ctl.close();
      },
    });
    const res = new Response(stream, { headers: { "content-length": "10" } });
    await expect(readCapped(res, 1000)).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
    await expect(
      readCapped(
        new Response("x", { headers: { "content-length": "999999" } }),
        1000,
      ),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});
