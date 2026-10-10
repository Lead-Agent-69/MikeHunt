// @vitest-environment node
// Node environment: axios must use its real http adapter (jsdom would swap in XHR).
//
// Ren's #293 nits, with REAL axios over a real socket and no options passed (guest defaults):
//  1. One deadline across the whole redirect chain: every hop is individually well under the
//     deadline, but the chain as a whole is not. A per-hop deadline would let it finish.
//  2. Positive controls: a 4MB body (under the 5MB cap) loads, and a fast 3-redirect chain finishes.
//  3. The deadline is armed before DNS: a DNS lookup that never answers is cut off by the deadline.
import http from "http";
import type { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dnsDelayMs = vi.hoisted(() => ({ value: 0 }));

// Loopback is (correctly) refused by the public-URL guard, so pin the test host to 127.0.0.1.
// The real pinnedAxiosOptions (pinned agent + proxy:false) is kept.
vi.mock("./pinned-dns", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pinned-dns")>();
  return {
    ...real,
    resolvePinnedTarget: async (raw: string) => {
      if (dnsDelayMs.value)
        await new Promise((r) => setTimeout(r, dnsDelayMs.value));
      return {
        url: new URL(raw),
        host: "listings.test",
        addresses: [{ address: "127.0.0.1", family: 4 as const }],
      };
    },
  };
});

import {
  MAX_HTML_BYTES,
  PUBLIC_FETCH_DEADLINE_MS,
  fetchPublicHtml,
} from "./fetch-public-html";

const HOP_DELAY_MS = 700; // each hop alone is far under the (shortened) 1500ms deadline
const SHORT_DEADLINE_MS = 1500;
const FOUR_MB = 4 * 1024 * 1024;

let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url || "/";
    let m = url.match(/^\/slow-hop\/(\d)$/);
    if (m) {
      // 0 -> 1 -> 2 -> 3 (final page). 4 requests x 700ms = 2.8s total, each one only 700ms.
      const n = Number(m[1]);
      setTimeout(() => {
        if (res.destroyed) return;
        if (n < 3) {
          res.writeHead(302, { location: `/slow-hop/${n + 1}` });
          res.end();
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<p>end of slow chain</p>");
        }
      }, HOP_DELAY_MS);
      return;
    }
    m = url.match(/^\/fast-hop\/(\d)$/);
    if (m) {
      const n = Number(m[1]);
      if (n < 3) {
        res.writeHead(302, { location: `/fast-hop/${n + 1}` });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<p>end of fast chain</p>");
      }
      return;
    }
    if (url === "/four-mb") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<p>" + "a".repeat(FOUR_MB - 7) + "</p>");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://listings.test:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  dnsDelayMs.value = 0;
  vi.restoreAllMocks();
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

function shortenDeadline() {
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  return vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation(() => realTimeout(SHORT_DEADLINE_MS));
}

describe("fetchPublicHtml: one deadline across the whole redirect chain", () => {
  it("a chain of individually-fast-enough slow hops is cut off by the overall deadline", async () => {
    const spy = shortenDeadline();
    const started = Date.now();
    const result = await fetchPublicHtml(`${base}/slow-hop/0`);
    const elapsed = Date.now() - started;
    // One deadline per call, not one per hop.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(PUBLIC_FETCH_DEADLINE_MS);
    // A per-hop deadline would let all 4 hops (700ms each) finish and return the final page.
    expect(result).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(SHORT_DEADLINE_MS - 100);
    expect(elapsed).toBeLessThan(4 * HOP_DELAY_MS);
  }, 15_000);

  it("control: the same slow chain completes when the deadline is long enough", async () => {
    // Proves the test above fails for the right reason (the chain itself is valid).
    const result = await fetchPublicHtml(`${base}/slow-hop/0`);
    expect(result).toEqual({
      html: "<p>end of slow chain</p>",
      finalUrl: `${base}/slow-hop/3`,
    });
  }, 15_000);
});

describe("fetchPublicHtml positive controls (guest defaults)", () => {
  it("a 4MB body loads under the 5MB default cap", async () => {
    expect(FOUR_MB).toBeLessThan(MAX_HTML_BYTES);
    const result = await fetchPublicHtml(`${base}/four-mb`);
    expect(result).not.toBeNull();
    expect(Buffer.byteLength(result!.html)).toBe(FOUR_MB);
  }, 15_000);

  it("a fast 3-redirect chain finishes and reports the final URL", async () => {
    await expect(fetchPublicHtml(`${base}/fast-hop/0`)).resolves.toEqual({
      html: "<p>end of fast chain</p>",
      finalUrl: `${base}/fast-hop/3`,
    });
  }, 15_000);
});

describe("fetchPublicHtml: the deadline is armed before DNS", () => {
  it("a DNS lookup slower than the deadline returns null at the deadline", async () => {
    shortenDeadline();
    dnsDelayMs.value = 5_000;
    const started = Date.now();
    await expect(fetchPublicHtml(`${base}/fast-hop/3`)).resolves.toBeNull();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(SHORT_DEADLINE_MS - 100);
    expect(elapsed).toBeLessThan(dnsDelayMs.value);
  }, 15_000);
});
