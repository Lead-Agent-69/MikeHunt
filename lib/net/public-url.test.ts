import { describe, expect, it, vi } from "vitest";

vi.mock("dns/promises", () => {
  const lookup = vi.fn(async (hostname: string) => {
    if (hostname === "public.example") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    if (hostname === "rebind.example") {
      return [{ address: "169.254.169.254", family: 4 }];
    }
    if (hostname === "localhost.example") {
      return [{ address: "127.0.0.1", family: 4 }];
    }
    throw Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
  });
  return { lookup, default: { lookup } };
});

import { UrlNotAllowedError, assertPublicHttpUrl, isBlockedIp } from "./public-url";

describe("public URL guard", () => {
  it.each([
    "169.254.169.254",
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.9",
    "172.16.0.1",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it("allows a public address", () => {
    expect(isBlockedIp("93.184.216.34")).toBe(false);
  });

  it.each([
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:3000/api/system/status",
    "http://localhost/admin",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://0177.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://[::1]/",
    "http://[::ffff:169.254.169.254]/",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
    "http://10.0.0.5/",
  ])("rejects %s before a fetch", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("rejects a hostname that resolves to metadata or loopback", async () => {
    await expect(assertPublicHttpUrl("https://rebind.example/latest/meta-data")).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
    await expect(assertPublicHttpUrl("http://localhost.example/")).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
  });

  it("accepts a hostname that resolves to a public address", async () => {
    const url = await assertPublicHttpUrl("https://public.example/ford/f150");
    expect(url.hostname).toBe("public.example");
  });
});
