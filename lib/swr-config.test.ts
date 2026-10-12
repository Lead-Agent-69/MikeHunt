import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import {
  defaultSWRConfig,
  fetcher,
  HttpRequestError,
  retryAfterMs,
  retryRequest,
  shouldRetryRequest,
} from "./swr-config";

const retryConfig = { ...SWRConfig.defaultValue, ...defaultSWRConfig };

describe("quota-aware shared requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves successful JSON results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"saved":true}')),
    );
    await expect(fetcher("/api/saved-cars")).resolves.toEqual({ saved: true });
  });
  it("retains status and retry timing without exposing error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server detail", {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
      ),
    );
    await expect(fetcher("/api/scan")).rejects.toMatchObject({
      status: 429,
      retryAfter: 120_000,
      message: "Failed to fetch",
    });
  });
  it("does not retry quota, authentication, missing or invalid requests", () => {
    const revalidate = vi.fn();
    for (const status of [400, 401, 402, 403, 404, 422]) {
      const error = new HttpRequestError(status);
      expect(shouldRetryRequest(error)).toBe(false);
      retryRequest(error, "/api/scan", retryConfig, revalidate, {
        retryCount: 1,
        dedupe: true,
      });
    }
    vi.runAllTimers();
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("honors provider cooldowns on both rate limits and temporary outages", () => {
    for (const status of [429, 503]) {
      const revalidate = vi.fn();
      retryRequest(
        new HttpRequestError(status, 120_000),
        "/api/scan",
        retryConfig,
        revalidate,
        { retryCount: 1, dedupe: true },
      );
      vi.advanceTimersByTime(119_999);
      expect(revalidate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revalidate).toHaveBeenCalledWith({ retryCount: 1, dedupe: true });
    }
  });
  it("uses a polite fallback when rate-limit cooldown is missing", () => {
    const revalidate = vi.fn();
    retryRequest(
      new HttpRequestError(429),
      "/api/scan",
      retryConfig,
      revalidate,
      { retryCount: 1, dedupe: true },
    );
    vi.advanceTimersByTime(59_999);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalledOnce();
  });
  it("keeps transient failures recoverable but bounds their retries", () => {
    const revalidate = vi.fn();
    const error = new Error("network offline");
    expect(shouldRetryRequest(error)).toBe(true);
    retryRequest(error, "/api/scan", retryConfig, revalidate, {
      retryCount: 1,
      dedupe: true,
    });
    retryRequest(error, "/api/scan", retryConfig, revalidate, {
      retryCount: 4,
      dedupe: true,
    });
    vi.advanceTimersByTime(5000);
    expect(revalidate).toHaveBeenCalledOnce();
  });
  it("does not schedule a retry loop across a long provider suspension", () => {
    const revalidate = vi.fn();
    retryRequest(
      new HttpRequestError(429, 86_400_001),
      "/api/scan",
      retryConfig,
      revalidate,
      { retryCount: 1, dedupe: true },
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("parses seconds and HTTP dates without accepting invalid numeric delays", () => {
    const now = Date.parse("2026-10-11T23:00:00Z");
    expect(retryAfterMs(" 60 ", now)).toBe(60_000);
    expect(retryAfterMs("Sun, 11 Oct 2026 23:02:00 GMT", now)).toBe(120_000);
    expect(retryAfterMs("Sun, 11 Oct 2026 22:00:00 GMT", now)).toBe(0);
    for (const value of [null, "", "nope", "-1", "1.5"]) {
      expect(retryAfterMs(value, now)).toBeUndefined();
    }
  });
});
