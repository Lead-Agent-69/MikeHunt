import { describe, expect, it, vi } from "vitest";

vi.mock("dns/promises", () => {
  const lookup = vi.fn(async (hostname: string) => {
    if (hostname === "listings.example") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    if (hostname === "rebind.example") {
      return [{ address: "10.0.0.5", family: 4 }];
    }
    throw Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
  });
  return { lookup, default: { lookup } };
});

import { UrlNotAllowedError } from "./public-url";
import {
  assertNavigationChainPublic,
  guardPublicRoute,
  type GuardRequestLike,
} from "./browser-guard";

function route(url: string) {
  return {
    request: () => ({ url: () => url }),
    abort: vi.fn(async () => {}),
    fallback: vi.fn(async () => {}),
  };
}

function chain(...urls: string[]): GuardRequestLike {
  // urls[0] is the first request; the last is the final request.
  let prev: GuardRequestLike | null = null;
  for (const u of urls) {
    const from: GuardRequestLike | null = prev;
    prev = { url: () => u, redirectedFrom: () => from };
  }
  return prev!;
}

describe("guardPublicRoute", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:3000/api/system/status",
    "http://localhost/",
    "http://10.0.0.5/",
    "http://rebind.example/",
    "file:///etc/passwd",
  ])("aborts %s", async (url) => {
    const r = route(url);
    await guardPublicRoute(r);
    expect(r.abort).toHaveBeenCalled();
    expect(r.fallback).not.toHaveBeenCalled();
  });

  it.each(["https://listings.example/car", "data:text/plain,hi", "about:blank"])(
    "falls through for %s",
    async (url) => {
      const r = route(url);
      await guardPublicRoute(r);
      expect(r.fallback).toHaveBeenCalled();
      expect(r.abort).not.toHaveBeenCalled();
    },
  );
});

describe("assertNavigationChainPublic", () => {
  it("accepts a short public chain", async () => {
    await expect(
      assertNavigationChainPublic(
        chain("https://listings.example/a", "https://listings.example/b"),
        "https://listings.example/b",
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a hop onto metadata", async () => {
    await expect(
      assertNavigationChainPublic(
        chain("https://listings.example/a", "http://169.254.169.254/latest"),
        "http://169.254.169.254/latest",
      ),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("rejects a private final URL even with no recorded chain", async () => {
    await expect(
      assertNavigationChainPublic(null, "http://192.168.1.1/"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
  });

  it("rejects more than 3 redirects", async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://listings.example/${i}`);
    await expect(
      assertNavigationChainPublic(chain(...urls), urls[4]),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
  });
});
