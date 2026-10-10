import { describe, it, expect } from "vitest";
import {
  isRetiredSource,
  retiredBypass,
  BypassRetiredError,
  RETIRED_SOURCES,
} from "./retired";
import {
  isAutomationAllowedSource,
  resolveSweepSources,
} from "./sweep-schedule";
import { createScraperRegistry } from "./runner";
import { fetchWithCloudflareBypass } from "./tools/cloudflare-bypass";
import { getFlareSolverr } from "./bypass/flaresolverr";
import { ProxyManager } from "./tools/proxy-manager";

describe("retired scrapers", () => {
  it("lists CarGurus and FB Marketplace as retired", () => {
    expect(isRetiredSource("cargurus")).toBe(true);
    expect(isRetiredSource("facebook_marketplace")).toBe(true);
    expect(isRetiredSource("gsa_auctions")).toBe(false);
  });

  it("never allows a retired source, even when an operator names it in SCRAPE_SOURCES", () => {
    expect(isAutomationAllowedSource("cargurus", "cargurus,gsa_auctions")).toBe(
      false,
    );
    expect(
      isAutomationAllowedSource("facebook_marketplace", "facebook_marketplace"),
    ).toBe(false);
    expect(
      resolveSweepSources("cargurus,facebook_marketplace,gsa_auctions"),
    ).toEqual(["gsa_auctions"]);
  });

  it("keeps them disabled in the runner registry", () => {
    const registry = createScraperRegistry();
    for (const id of ["cargurus", "facebook_marketplace"]) {
      expect(registry.get(id)?.enabled).toBe(false);
    }
    expect(Object.keys(RETIRED_SOURCES)).toContain("cargurus");
  });
});

describe("retired bypass tooling", () => {
  it("throws for any bypass entry point", async () => {
    expect(() => retiredBypass("proxy")).toThrow(BypassRetiredError);
    expect(() => getFlareSolverr()).toThrow(BypassRetiredError);
    await expect(
      fetchWithCloudflareBypass("https://example.com"),
    ).rejects.toBeInstanceOf(BypassRetiredError);
  });

  it("ignores configured proxies", () => {
    const prev = process.env.PROXY_URLS;
    process.env.PROXY_URLS = "http://user:pass@1.2.3.4:8080";
    try {
      const pm = new ProxyManager();
      expect(pm.getProxy()).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.PROXY_URLS;
      else process.env.PROXY_URLS = prev;
    }
  });
});
