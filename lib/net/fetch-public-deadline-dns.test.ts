// @vitest-environment node
// Node environment: axios must use its real http adapter (jsdom would swap in XHR).
//
// Ren's #311 review (R1, R2 + nits), real axios over a real loopback socket:
//  R1  fetchPublicImage arms the deadline BEFORE DNS and races the lookup (a hung lookup returns at
//      the deadline, not when DNS finally answers).
//  R2  no unhandled rejection: a pre-aborted signal + blocked URL throws UrlNotAllowedError (and
//      starts no lookup); a lookup that rejects after the deadline already fired is handled.
//  nit a redirect hop whose DNS hangs is cut off by the same deadline (html and image).
//  nit the allowUrl source-policy (robots) check is raced against the deadline.
import http from "http";
import type { AddressInfo } from "net";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type Plan = { delayMs?: number; hang?: boolean; reject?: boolean };
const dns = vi.hoisted(() => ({
  plan: new Map<string, Plan>(),
  calls: [] as string[],
}));

// Loopback is (correctly) refused by the public-URL guard, so every *.test host is pinned to
// 127.0.0.1, with a per-host plan to delay, hang or reject the "lookup". parsePinnableUrl and
// pinnedAxiosOptions stay real.
vi.mock("./pinned-dns", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pinned-dns")>();
  const { UrlNotAllowedError } = await import("./public-url");
  return {
    ...real,
    resolvePinnedTarget: async (raw: string) => {
      const url = real.parsePinnableUrl(raw);
      dns.calls.push(url.hostname);
      const plan = dns.plan.get(url.hostname) || {};
      if (plan.delayMs) await new Promise((r) => setTimeout(r, plan.delayMs));
      if (plan.hang) await new Promise(() => {});
      if (plan.reject) throw new UrlNotAllowedError();
      return {
        url,
        host: url.hostname,
        addresses: [{ address: "127.0.0.1", family: 4 as const }],
      };
    },
  };
});

import { UrlNotAllowedError } from "./public-url";
import { PUBLIC_FETCH_DEADLINE_MS, fetchPublicHtml } from "./fetch-public-html";
import { fetchPublicImage } from "./fetch-public-image";

const DEADLINE_MS = 800;
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

let server: http.Server;
let port = 0;
const at = (host: string, path: string) => `http://${host}:${port}${path}`;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url === "/page") {
      res.writeHead(200, { "content-type": "text/html" });
      return void res.end("<p>Car</p>");
    }
    if (url === "/img") {
      res.writeHead(200, { "content-type": "image/png" });
      return void res.end(PNG);
    }
    const m = url.match(/^\/to\/([a-z0-9.-]+)\/(page|img)$/);
    if (m) {
      res.writeHead(302, { location: at(m[1], `/${m[2]}`) });
      return void res.end();
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  process.on("unhandledRejection", onUnhandled);
});

beforeEach(() => {
  dns.plan.clear();
  dns.calls.length = 0;
  unhandled.length = 0;
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  process.off("unhandledRejection", onUnhandled);
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

function shortenDeadline() {
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  return vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation(() => realTimeout(DEADLINE_MS));
}
const settle = () => new Promise((r) => setTimeout(r, 50));
const allowAll = () => true;

async function timed<T>(p: Promise<T>) {
  const t0 = Date.now();
  const value = await p;
  return { value, ms: Date.now() - t0 };
}

describe("R1: fetchPublicImage arms the deadline before DNS", () => {
  it("control: an image loads through the pinned agent", async () => {
    const r = await fetchPublicImage(at("img.test", "/img"), allowAll);
    expect(r).toMatchObject({ ok: true, contentType: "image/png" });
  });

  it("a first-hop lookup slower than the deadline returns at the deadline", async () => {
    const spy = shortenDeadline();
    dns.plan.set("slowdns.test", { delayMs: 2500 });
    const { value, ms } = await timed(
      fetchPublicImage(at("slowdns.test", "/img"), allowAll),
    );
    expect(spy).toHaveBeenCalledWith(PUBLIC_FETCH_DEADLINE_MS);
    expect(value).toEqual({
      ok: false,
      status: 502,
      reason: "upstream fetch failed",
    });
    expect(ms).toBeGreaterThanOrEqual(DEADLINE_MS - 100);
    expect(ms).toBeLessThan(2000); // was ~2503ms before: DNS ran before the deadline was armed
  }, 15_000);
});

describe("nit: a redirect hop whose DNS hangs is cut off by the same deadline", () => {
  it("html", async () => {
    shortenDeadline();
    dns.plan.set("hang.test", { hang: true });
    const { value, ms } = await timed(
      fetchPublicHtml(at("first.test", "/to/hang.test/page")),
    );
    expect(value).toBeNull();
    expect(dns.calls).toEqual(["first.test", "hang.test"]);
    expect(ms).toBeGreaterThanOrEqual(DEADLINE_MS - 100);
    expect(ms).toBeLessThan(3000);
  }, 15_000);

  it("image", async () => {
    shortenDeadline();
    dns.plan.set("hang.test", { hang: true });
    const { value, ms } = await timed(
      fetchPublicImage(at("first.test", "/to/hang.test/img"), allowAll),
    );
    expect(value).toMatchObject({ ok: false, status: 502 });
    expect(dns.calls).toEqual(["first.test", "hang.test"]);
    expect(ms).toBeLessThan(3000);
  }, 15_000);

  it("control: the same redirect with fast DNS completes", async () => {
    await expect(
      fetchPublicHtml(at("first.test", "/to/second.test/page")),
    ).resolves.toEqual({
      html: "<p>Car</p>",
      finalUrl: at("second.test", "/page"),
    });
  });
});

describe("nit: the allowUrl source-policy check is raced against the deadline", () => {
  it("a robots check that never answers returns null at the deadline", async () => {
    shortenDeadline();
    const allowUrl = vi.fn(() => new Promise<boolean>(() => {}));
    const { value, ms } = await timed(
      fetchPublicHtml(at("robots.test", "/page"), allowUrl),
    );
    expect(value).toBeNull();
    expect(allowUrl).toHaveBeenCalledTimes(1);
    expect(ms).toBeLessThan(3000);
  }, 15_000);

  it("a robots check that rejects after the deadline is not an unhandled rejection", async () => {
    shortenDeadline();
    const allowUrl = () =>
      new Promise<boolean>((_, reject) =>
        setTimeout(
          () => reject(new Error("robots fetch failed")),
          DEADLINE_MS + 200,
        ),
      );
    await expect(
      fetchPublicHtml(at("robots.test", "/page"), allowUrl),
    ).resolves.toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(unhandled).toEqual([]);
  }, 15_000);
});

describe("R2: aborted signals never leave an unhandled rejection", () => {
  it.each([
    ["metadata literal", "http://169.254.169.254/latest/meta-data"],
    ["loopback literal", "http://127.0.0.1/"],
    ["non-http scheme", "file:///etc/passwd"],
  ])(
    "pre-aborted + blocked URL (%s) throws UrlNotAllowedError (html)",
    async (_, url) => {
      await expect(
        fetchPublicHtml(url, { signal: AbortSignal.abort() }),
      ).rejects.toBeInstanceOf(UrlNotAllowedError);
      await settle();
      expect(unhandled).toEqual([]);
      expect(dns.calls).toEqual([]);
    },
  );

  it("pre-aborted + blocked URL throws UrlNotAllowedError (image)", async () => {
    await expect(
      fetchPublicImage(
        "http://169.254.169.254/x.png",
        allowAll,
        {},
        {
          signal: AbortSignal.abort(),
        },
      ),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("pre-aborted + allowed URL returns null/502 and starts no DNS lookup", async () => {
    await expect(
      fetchPublicHtml(at("ok.test", "/page"), { signal: AbortSignal.abort() }),
    ).resolves.toBeNull();
    await expect(
      fetchPublicImage(
        at("ok.test", "/img"),
        allowAll,
        {},
        { signal: AbortSignal.abort() },
      ),
    ).resolves.toMatchObject({ ok: false, status: 502 });
    expect(dns.calls).toEqual([]);
    await settle();
    expect(unhandled).toEqual([]);
  });

  it("a lookup that rejects (UrlNotAllowedError) after the deadline fired is handled", async () => {
    shortenDeadline();
    dns.plan.set("late.test", { delayMs: DEADLINE_MS + 200, reject: true });
    await expect(fetchPublicHtml(at("late.test", "/page"))).resolves.toBeNull();
    await expect(
      fetchPublicImage(at("late.test", "/img"), allowAll),
    ).resolves.toMatchObject({
      ok: false,
      status: 502,
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(unhandled).toEqual([]);
  }, 15_000);

  it("a caller abort mid-lookup (deal-check client disconnect) returns null without leaks", async () => {
    dns.plan.set("disc.test", { delayMs: 300, reject: true });
    const caller = new AbortController();
    setTimeout(() => caller.abort(), 50);
    await expect(
      fetchPublicHtml(at("disc.test", "/page"), { signal: caller.signal }),
    ).resolves.toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(unhandled).toEqual([]);
  });
});
