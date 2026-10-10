// @vitest-environment node
// Node environment: axios must use its real http adapter (jsdom would swap in XHR).
// Behavioral bounds for fetchPublicHtml with REAL axios and a real socket (no axios mock):
// a slow-drip page must hit the overall deadline even though each chunk arrives inside axios'
// 6s idle timeout, and an oversized body must hit the default maxBytes cap. Both with no options
// passed, i.e. exactly what a guest request gets.
import http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The test server listens on loopback, which the public-URL guard (correctly) refuses. Pin the
// test hostname to 127.0.0.1 instead; the real pinnedAxiosOptions (agent + proxy:false) is kept.
vi.mock("./pinned-dns", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pinned-dns")>();
  return {
    ...real,
    resolvePinnedTarget: async (raw: string) => ({
      url: new URL(raw),
      host: "listings.test",
      addresses: [{ address: "127.0.0.1", family: 4 as const }],
    }),
  };
});

import {
  MAX_HTML_BYTES,
  PUBLIC_FETCH_DEADLINE_MS,
  fetchPublicHtml,
} from "./fetch-public-html";

let server: http.Server;
let base = "";
const timers = new Set<NodeJS.Timeout>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/slow-drip") {
      // One byte every 300ms, forever: never idle long enough for a 6s idle timeout.
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<html>");
      const t = setInterval(() => res.write("x"), 300);
      timers.add(t);
      res.on("close", () => {
        clearInterval(t);
        timers.delete(t);
      });
      return;
    }
    if (req.url === "/oversized") {
      // Chunked, no content-length, so the cap has to be enforced while streaming.
      res.writeHead(200, { "content-type": "text/html" });
      const chunk = Buffer.alloc(256 * 1024, "a");
      let sent = 0;
      const pump = () => {
        while (sent < MAX_HTML_BYTES + 2 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) return void res.once("drain", pump);
        }
        res.end();
      };
      res.on("error", () => {});
      pump();
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<p>Car</p>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://listings.test:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const t of timers) clearInterval(t);
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  vi.restoreAllMocks();
});

describe("fetchPublicHtml bounds with no options (guest defaults)", () => {
  it("sanity: a normal page still loads through the pinned agent", async () => {
    await expect(fetchPublicHtml(`${base}/ok`)).resolves.toEqual({
      html: "<p>Car</p>",
      finalUrl: `${base}/ok`,
    });
  });

  it("a slow-drip response is cut off by the overall deadline", async () => {
    // Shorten the real 10s deadline so the test is fast, and prove fetchPublicHtml asks for 10s.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => realTimeout(1500));
    const started = Date.now();
    const result = await fetchPublicHtml(`${base}/slow-drip`);
    const elapsed = Date.now() - started;
    expect(spy).toHaveBeenCalledWith(PUBLIC_FETCH_DEADLINE_MS);
    spy.mockRestore();
    expect(result).toBeNull();
    // Aborted by the deadline (~1.5s), long before axios' 6s idle timer could ever fire.
    expect(elapsed).toBeGreaterThanOrEqual(1400);
    expect(elapsed).toBeLessThan(5000);
  }, 15_000);

  it("an oversized body is cut off at the default maxBytes cap", async () => {
    expect(MAX_HTML_BYTES).toBe(5 * 1024 * 1024);
    const started = Date.now();
    await expect(fetchPublicHtml(`${base}/oversized`)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(PUBLIC_FETCH_DEADLINE_MS);
  }, 15_000);

  it("a caller can't raise the cap past the default", async () => {
    await expect(
      fetchPublicHtml(`${base}/oversized`, { maxBytes: 1e12 }),
    ).resolves.toBeNull();
  }, 15_000);
});
