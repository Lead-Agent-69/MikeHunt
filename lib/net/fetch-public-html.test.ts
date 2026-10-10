import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

vi.mock("dns/promises", () => {
  const lookup = vi.fn(async (hostname: string) => {
    if (hostname === "listings.example") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    throw Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
  });
  return { lookup, default: { lookup } };
});

import { UrlNotAllowedError } from "./public-url";
import { fetchPublicHtml } from "./fetch-public-html";

describe("fetchPublicHtml", () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it("does not request a metadata address", async () => {
    await expect(
      fetchPublicHtml("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("does not follow a redirect onto a metadata address", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
      data: "",
    });
    await expect(
      fetchPublicHtml("https://listings.example/ford/escape"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(String(axiosGet.mock.calls[0][0])).toContain("listings.example");
  });

  it("returns null when the public fetch fails", async () => {
    axiosGet.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      fetchPublicHtml("https://listings.example/ford/escape"),
    ).resolves.toBeNull();
  });
  it("preserves request cancellation and bounded document reads", async () => {
    axiosGet.mockResolvedValueOnce({ status: 200, data: "<p>Car</p>" });
    const controller = new AbortController();
    await fetchPublicHtml("https://listings.example/ford/escape", {
      signal: controller.signal,
      maxBytes: 2000000,
    });
    expect(axiosGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        maxContentLength: 2000000,
        maxRedirects: 0,
      }),
    );
    // The caller's signal is combined with the overall deadline (AbortSignal.any).
    const signal: AbortSignal = axiosGet.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
  it("checks page policy before each redirect request", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: "/forbidden" },
      data: "",
    });
    const allowed = vi.fn(async (url: string) => !url.endsWith("/forbidden"));
    await expect(
      fetchPublicHtml("https://listings.example/inventory", allowed),
    ).rejects.toThrow("source policy");
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(allowed).toHaveBeenCalledTimes(2);
  });
});

describe("fetchPublicHtml pins DNS (save-from-url path)", () => {
  it("hands axios a pinned agent: one DNS query, lookup answers only the validated IP", async () => {
    const dns = (await import("dns/promises")) as any;
    dns.lookup.mockClear();
    axiosGet.mockReset();
    axiosGet.mockResolvedValueOnce({ status: 200, data: "<p>Car</p>" });
    await fetchPublicHtml("https://listings.example/ford/escape");
    const init = axiosGet.mock.calls[0][1];
    expect(init.httpsAgent).toBe(init.httpAgent);
    const lookup = init.httpsAgent.options.lookup;
    const answer = await new Promise<any>((resolve, reject) =>
      lookup("listings.example", {}, (err: any, addr: any) =>
        err ? reject(err) : resolve(addr),
      ),
    );
    expect(answer).toBe("93.184.216.34");
    expect(init.httpsAgent.options.keepAlive).toBe(false);
    expect(dns.lookup).toHaveBeenCalledTimes(1);
  });
});

describe("fetchPublicHtml proxy + size defaults", () => {
  it("sends proxy: false and caps the page at ~5MB by default", async () => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValueOnce({ status: 200, data: "<p>Car</p>" });
    await fetchPublicHtml("https://listings.example/ford/escape");
    const init = axiosGet.mock.calls[0][1];
    expect(init.proxy).toBe(false);
    expect(init.maxContentLength).toBe(5 * 1024 * 1024);
  });
});

describe("fetchPublicHtml overall deadline signal", () => {
  it("always passes a signal, and it follows the caller's abort", async () => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ status: 200, data: "<p>Car</p>" });
    await fetchPublicHtml("https://listings.example/a");
    expect(axiosGet.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

    const caller = new AbortController();
    await fetchPublicHtml("https://listings.example/b", {
      signal: caller.signal,
    });
    const combined: AbortSignal = axiosGet.mock.calls[1][1].signal;
    expect(combined).not.toBe(caller.signal);
    expect(combined.aborted).toBe(false);
    caller.abort();
    expect(combined.aborted).toBe(true);
  });

  it("the overall deadline is 10s", async () => {
    const { PUBLIC_FETCH_DEADLINE_MS, publicFetchSignal } =
      await import("./fetch-public-html");
    expect(PUBLIC_FETCH_DEADLINE_MS).toBe(10_000);
    expect(publicFetchSignal().aborted).toBe(false);
  });
});

describe("byte caps can't be disabled by a bad maxBytes", () => {
  it.each([NaN, -1, 0, Infinity, -Infinity, undefined])(
    "maxBytes=%s falls back to the 5MB cap",
    async (m) => {
      axiosGet.mockReset();
      axiosGet.mockResolvedValueOnce({ status: 200, data: "<p>Car</p>" });
      await fetchPublicHtml("https://listings.example/a", {
        maxBytes: m as number,
      });
      expect(axiosGet.mock.calls[0][1].maxContentLength).toBe(5 * 1024 * 1024);
    },
  );

  it("a smaller maxBytes is honored, a larger one is clamped", async () => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ status: 200, data: "<p>Car</p>" });
    await fetchPublicHtml("https://listings.example/a", {
      maxBytes: 2_000_000,
    });
    await fetchPublicHtml("https://listings.example/b", { maxBytes: 1e12 });
    expect(axiosGet.mock.calls[0][1].maxContentLength).toBe(2_000_000);
    expect(axiosGet.mock.calls[1][1].maxContentLength).toBe(5 * 1024 * 1024);
  });
});
