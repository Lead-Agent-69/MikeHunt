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
    if (hostname === "sixto4.example") {
      return [{ address: "2002:a9fe:a9fe::", family: 6 }];
    }
    if (hostname === "nat64.example") {
      return [{ address: "64:ff9b::a9fe:a9fe", family: 6 }];
    }
    throw Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
  });
  return { lookup, default: { lookup } };
});

import {
  UrlNotAllowedError,
  assertPublicHttpUrl,
  classifyHostname,
  ipv4EmbeddedInV6,
  isBlockedIp,
} from "./public-url";

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
    "2002:a9fe:a9fe::",
    "2002:7f00:1::",
    "2002:c0a8:101::",
    "2002:a00:1::",
    "64:ff9b::a9fe:a9fe",
    "64:ff9b::169.254.169.254",
    "64:ff9b:1:c0a8:1:100::",
    "64:ff9b:1:c0a8:101:100::",
  ])("blocks IPv4 smuggled in %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["2002:808:808::", "64:ff9b::808:808"])(
    "allows a public address embedded in %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );

  it("unwraps 6to4 to the embedded IPv4", () => {
    expect(ipv4EmbeddedInV6("2002:a9fe:a9fe::")).toBe("169.254.169.254");
    expect(ipv4EmbeddedInV6("64:ff9b::169.254.169.254")).toBe(
      "169.254.169.254",
    );
    expect(ipv4EmbeddedInV6("64:ff9b:1:c0a8:1:100::")).toBe("192.168.1.1");
    expect(ipv4EmbeddedInV6("2002:808:808::")).toBe("8.8.8.8");
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
    "http://[2002:a9fe:a9fe::]/",
    "http://[64:ff9b::a9fe:a9fe]/",
    "http://[64:ff9b::169.254.169.254]/",
    "http://[64:ff9b:1:c0a8:1:100::]/",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
    "http://10.0.0.5/",
  ])("rejects %s before a fetch", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toBeInstanceOf(
      UrlNotAllowedError,
    );
  });

  it("rejects a hostname that resolves to metadata or loopback", async () => {
    await expect(
      assertPublicHttpUrl("https://rebind.example/latest/meta-data"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    await expect(
      assertPublicHttpUrl("http://localhost.example/"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    await expect(
      assertPublicHttpUrl("http://sixto4.example/"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    await expect(
      assertPublicHttpUrl("http://nat64.example/latest"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("accepts a hostname that resolves to a public address", async () => {
    const url = await assertPublicHttpUrl("https://public.example/ford/f150");
    expect(url.hostname).toBe("public.example");
  });
});

describe("IPv6 blocklist additions (Ren #229 follow-up)", () => {
  it.each([
    // ff00::/8 multicast
    "ff02::1",
    "ff05::1:3",
    "FF0E::1",
    // ::/96 IPv4-compatible
    "::7f00:1",
    "::127.0.0.1",
    "::a9fe:a9fe",
    "::8.8.8.8",
    "0:0:0:0:0:0:5db8:d822",
    // fec0::/10 site-local
    "fec0::1",
    "fed0::1",
    "feff:ffff::1",
    // 2001::/32 Teredo
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "2001::1",
    "2001:0000:abcd::1",
    // unparseable fails closed
    "fe80:::1",
    "1:2:3:4:5:6:7:8:9",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    "2606:4700:4700::1111",
    "2001:4860:4860::8888", // 2001:4860::/32 is Google, not Teredo
    "2001:1::1", // 2001:0001:: is outside 2001::/32
    "2a00:1450:4001::200e",
    "fe00::1", // just below fe80::/10
  ])("allows public %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it("classifyHostname blocks bracketed literals in the new ranges", () => {
    for (const h of ["[ff02::1]", "[::127.0.0.1]", "[fec0::1]", "[2001::1]"]) {
      expect(classifyHostname(h), h).toBe("blocked");
    }
  });
});
