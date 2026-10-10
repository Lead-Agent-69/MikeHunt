import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Rebinding resolver: first answer public, every later answer loopback.
const dnsLookup = vi.hoisted(() => vi.fn());
vi.mock("dns/promises", () => ({
  lookup: dnsLookup,
  default: { lookup: dnsLookup },
}));

import { UrlNotAllowedError } from "./public-url";
import {
  pinnedAgent,
  pinnedLookup,
  pinnedRequest,
  resolvePinnedTarget,
} from "./pinned-dns";

beforeEach(() => {
  dnsLookup.mockReset();
  let n = 0;
  dnsLookup.mockImplementation(async () =>
    n++ === 0
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "127.0.0.1", family: 4 }],
  );
});

const lookupOnce = (
  fn: ReturnType<typeof pinnedLookup>,
  host: string,
  all = false,
) =>
  new Promise<any>((resolve, reject) =>
    (fn as any)(host, { all }, (err: Error | null, addr: any, fam: any) =>
      err ? reject(err) : resolve(all ? addr : { addr, fam }),
    ),
  );

describe("resolvePinnedTarget + pinnedLookup (DNS rebinding)", () => {
  it("resolves once and keeps answering with the validated address", async () => {
    const target = await resolvePinnedTarget("https://rebind.example/listing");
    expect(target.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
    const lookup = pinnedLookup(target);
    for (let i = 0; i < 3; i++) {
      expect(await lookupOnce(lookup, "rebind.example")).toEqual({
        addr: "93.184.216.34",
        fam: 4,
      });
    }
    expect(await lookupOnce(lookup, "REBIND.example.", true)).toEqual([
      { address: "93.184.216.34", family: 4 },
    ]);
    // The second (rebound) DNS answer was never asked for.
    expect(dnsLookup).toHaveBeenCalledTimes(1);
  });

  it("refuses to answer for any other hostname", async () => {
    const target = await resolvePinnedTarget("http://rebind.example/");
    await expect(
      lookupOnce(pinnedLookup(target), "evil.example"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("refuses when the one DNS answer contains a blocked address", async () => {
    dnsLookup.mockReset();
    dnsLookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(
      resolvePinnedTarget("http://mixed.example/"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/",
    "http://localhost/",
    "ftp://93.184.216.34/",
    "http://u:p@93.184.216.34/",
    "not a url",
  ])("refuses %s without DNS", async (url) => {
    await expect(resolvePinnedTarget(url)).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it("pins a literal public IP without DNS, and picks the agent by scheme", async () => {
    const t = await resolvePinnedTarget("https://93.184.216.34/x");
    expect(t.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(dnsLookup).not.toHaveBeenCalled();
    expect(pinnedAgent(t).constructor.name).toBe("Agent");
    expect((pinnedAgent(t) as any).protocol).toBe("https:");
    const h = await resolvePinnedTarget("http://93.184.216.34/x");
    expect((pinnedAgent(h) as any).protocol).toBe("http:");
  });
});

describe("pinnedRequest connects to the pinned IP with the real Host header", () => {
  let server: Server;
  let port = 0;
  const seen: { host?: string; method?: string }[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ host: req.headers.host, method: req.method });
      res.statusCode = 204;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("never consults DNS for the hostname at connect time", async () => {
    // A name that does not resolve anywhere: the request can only succeed through the pin.
    // (127.0.0.1 is pinned by hand here only because the test server lives on loopback;
    // resolvePinnedTarget would never produce it.)
    const target = {
      url: new URL(`http://pinned-only.invalid:${port}/listing`),
      host: "pinned-only.invalid",
      addresses: [{ address: "127.0.0.1", family: 4 as const }],
    };
    const res = await pinnedRequest(target, { method: "HEAD" });
    expect(res.status).toBe(204);
    expect(seen.at(-1)).toEqual({
      host: `pinned-only.invalid:${port}`,
      method: "HEAD",
    });
    expect(dnsLookup).not.toHaveBeenCalled();
  });
});
