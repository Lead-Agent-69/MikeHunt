import { describe, expect, it } from "vitest";
import { DomainLimiter } from "./limiter";
import { MemoryPageCache } from "./cache";
import {
  PoliteCrawler,
  readCapped,
  ResponseTooLargeError,
} from "./polite-fetch";

// Ren #321 nit: response size cap. (The per-hop public-address check is on main via #294 guardedFetch.)
function crawler(routes: Record<string, () => Response>, seen: string[]) {
  return new PoliteCrawler({
    fetchImpl: async (url) => {
      seen.push(url);
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
  });
}

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
