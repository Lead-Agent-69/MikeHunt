import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

vi.mock("dns/promises", () => {
  const lookup = vi.fn(async (hostname: string) => {
    if (hostname === "images.craigslist.org" || hostname === "cdn.cars.com") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    if (hostname === "rebind.craigslist.org") {
      return [{ address: "169.254.169.254", family: 4 }];
    }
    throw Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
  });
  return { lookup, default: { lookup } };
});

import { UrlNotAllowedError } from "./public-url";
import { fetchPublicImage, safeImageContentType } from "./fetch-public-image";
import { isAllowedImageUrl } from "@/app/api/image/proxy/route";

const IMG = "https://images.craigslist.org/abc_600x450.jpg";

function ok(contentType = "image/jpeg") {
  return {
    status: 200,
    headers: { "content-type": contentType },
    data: new Uint8Array([1, 2, 3]).buffer,
  };
}

describe("fetchPublicImage", () => {
  beforeEach(() => axiosGet.mockReset());

  it("returns image bytes from an allowed public host without auto-redirects", async () => {
    axiosGet.mockResolvedValueOnce(ok());
    const res = await fetchPublicImage(IMG, isAllowedImageUrl);
    expect(res).toMatchObject({ ok: true, contentType: "image/jpeg" });
    expect(axiosGet.mock.calls[0][1]).toMatchObject({ maxRedirects: 0 });
  });

  it("refuses a redirect onto cloud metadata without requesting it", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
      data: new ArrayBuffer(0),
    });
    await expect(fetchPublicImage(IMG, isAllowedImageUrl)).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect onto a non-allowlisted host", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 301,
      headers: { location: "https://attacker.example/x.jpg" },
      data: new ArrayBuffer(0),
    });
    await expect(fetchPublicImage(IMG, isAllowedImageUrl)).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it("refuses an allowlisted hostname whose DNS points at a private address", async () => {
    await expect(
      fetchPublicImage("https://rebind.craigslist.org/a.jpg", isAllowedImageUrl),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("follows an allowed public redirect hop", async () => {
    axiosGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: "https://cdn.cars.com/a.webp" },
        data: new ArrayBuffer(0),
      })
      .mockResolvedValueOnce(ok("image/webp"));
    const res = await fetchPublicImage(IMG, isAllowedImageUrl);
    expect(res).toMatchObject({
      ok: true,
      contentType: "image/webp",
      finalUrl: "https://cdn.cars.com/a.webp",
    });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it("stops after too many redirects", async () => {
    axiosGet.mockResolvedValue({
      status: 302,
      headers: { location: IMG },
      data: new ArrayBuffer(0),
    });
    const res = await fetchPublicImage(IMG, isAllowedImageUrl);
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(axiosGet).toHaveBeenCalledTimes(4);
  });

  it("refuses SVG / HTML bodies", async () => {
    axiosGet.mockResolvedValueOnce(ok("image/svg+xml"));
    expect(await fetchPublicImage(IMG, isAllowedImageUrl)).toMatchObject({
      ok: false,
      status: 415,
    });
    axiosGet.mockResolvedValueOnce(ok("text/html; charset=utf-8"));
    expect(await fetchPublicImage(IMG, isAllowedImageUrl)).toMatchObject({
      ok: false,
      status: 415,
    });
  });
});

describe("safeImageContentType", () => {
  it("passes raster types and defaults octet-stream to jpeg", () => {
    expect(safeImageContentType("image/png")).toBe("image/png");
    expect(safeImageContentType("application/octet-stream")).toBe("image/jpeg");
    expect(safeImageContentType(null)).toBe("image/jpeg");
    expect(safeImageContentType("image/svg+xml")).toBeNull();
    expect(safeImageContentType("text/html")).toBeNull();
  });
});

describe("fetchPublicImage on the DNS pin", () => {
  it("resolves once per hop, pins the agent, and disables proxies", async () => {
    const dns = (await import("dns/promises")) as any;
    dns.lookup.mockClear();
    axiosGet.mockReset();
    axiosGet.mockResolvedValueOnce(ok());
    const res = await fetchPublicImage(IMG, isAllowedImageUrl);
    expect(res.ok).toBe(true);
    const init = axiosGet.mock.calls[0][1];
    expect(init.proxy).toBe(false);
    expect(init.httpsAgent).toBe(init.httpAgent);
    const answer = await new Promise<any>((resolve, reject) =>
      init.httpsAgent.options.lookup(
        "images.craigslist.org",
        {},
        (err: any, addr: any) => (err ? reject(err) : resolve(addr)),
      ),
    );
    expect(answer).toBe("93.184.216.34");
    expect(dns.lookup).toHaveBeenCalledTimes(1);
  });

  it("refuses a host whose single DNS answer is metadata, before any request", async () => {
    axiosGet.mockReset();
    await expect(
      fetchPublicImage("https://rebind.craigslist.org/x.jpg", isAllowedImageUrl),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(axiosGet).not.toHaveBeenCalled();
  });
});

describe("fetchPublicImage signal + byte cap", () => {
  it("passes a combined deadline signal and honors a smaller maxBytes", async () => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValueOnce(ok());
    const caller = new AbortController();
    await fetchPublicImage(IMG, isAllowedImageUrl, {}, {
      signal: caller.signal,
      maxBytes: 1234,
    });
    const init = axiosGet.mock.calls[0][1];
    expect(init.maxContentLength).toBe(1234);
    expect(init.signal.aborted).toBe(false);
    caller.abort();
    expect(init.signal.aborted).toBe(true);
  });

  it("never raises the cap above MAX_IMAGE_BYTES", async () => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValueOnce(ok());
    await fetchPublicImage(IMG, isAllowedImageUrl, {}, { maxBytes: 1e12 });
    expect(axiosGet.mock.calls[0][1].maxContentLength).toBe(10 * 1024 * 1024);
  });
});

describe("image byte cap can't be disabled by a bad maxBytes", () => {
  it.each([NaN, -1, 0, Infinity, -Infinity])(
    "maxBytes=%s falls back to the 10MB cap",
    async (m) => {
      axiosGet.mockReset();
      axiosGet.mockResolvedValueOnce(ok());
      await fetchPublicImage(IMG, isAllowedImageUrl, {}, { maxBytes: m });
      expect(axiosGet.mock.calls[0][1].maxContentLength).toBe(10 * 1024 * 1024);
    },
  );
});
