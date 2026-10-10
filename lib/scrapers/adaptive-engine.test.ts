import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AdaptiveEngine } from "./adaptive-engine";
import { politeFetch } from "./polite/polite-fetch";

vi.mock("./access-policy", () => ({ assertSourceAccess: vi.fn() }));
vi.mock("./polite/polite-fetch", () => ({ politeFetch: vi.fn() }));

function createMockBrowserPool() {
  return {
    getPage: vi
      .fn()
      .mockRejectedValue(new Error("Browser pool unavailable in unit tests")),
    close: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("AdaptiveEngine", () => {
  let engine: AdaptiveEngine;

  beforeEach(() => {
    engine = new AdaptiveEngine({
      maxBrowserPages: 2,
      browserPool: createMockBrowserPool(),
    });
  });

  afterEach(async () => {
    await engine.close();
    vi.restoreAllMocks();
  });

  it("uses static mode for simple HTML", async () => {
    vi.mocked(politeFetch).mockResolvedValue({
      ok: true,
      status: 200,
      body:
        '<html><body><h1>Hello</h1><div class="item">car</div><p>' +
        "x".repeat(300) +
        "</p></body></html>",
      url: "https://example.com/page",
      fromCache: false,
      notModified: false,
    });

    const result = await engine.fetch("https://example.com/page", {
      name: "test",
      baseUrl: "https://example.com",
      renderMode: "adaptive",
      requestDelay: 0,
      concurrency: 1,
      useProxies: false,
      stealth: true,
      maxPages: 1,
    });

    expect(result.mode).toBe("static");
    expect(result.$("h1").text()).toBe("Hello");
    expect(engine.getHostModeCache()["example.com"]).toBe("static");
    await result.close();
  });

  it("stops without browser escalation when static returns blocked text", async () => {
    vi.mocked(politeFetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: "<html><body>Please wait while we verify you are human. Cloudflare protection.</body></html>",
      url: "https://example.com/page",
      fromCache: false,
      notModified: false,
    });

    await expect(
      engine.fetch("https://example.com/page", {
        name: "test",
        baseUrl: "https://example.com",
        renderMode: "adaptive",
        requestDelay: 0,
        concurrency: 1,
        useProxies: false,
        stealth: true,
        maxPages: 1,
      }),
    ).rejects.toThrow();

    expect(engine.getHostModeCache()["example.com"]).toBeUndefined();
  });

  it("does not let a copied host cache bypass a denied request", async () => {
    const cache = engine.getHostModeCache();
    cache["example.com"] = "browser";

    vi.mocked(politeFetch).mockResolvedValue({
      ok: false,
      status: 403,
      body: "",
      url: "https://example.com/page",
      fromCache: false,
      notModified: false,
    });

    await expect(
      engine.fetch("https://example.com/page", {
        name: "test",
        baseUrl: "https://example.com",
        renderMode: "adaptive",
        requestDelay: 0,
        concurrency: 1,
        useProxies: false,
        stealth: true,
        maxPages: 1,
      }),
    ).rejects.toThrow();
  });
});
