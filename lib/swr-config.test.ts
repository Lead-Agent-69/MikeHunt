import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import {
  defaultSWRConfig,
  fetcher,
  HttpRequestError,
  retryAfterMs,
  retryRequest,
  shouldRetryRequest,
  REQUEST_TIMEOUT_MS,
} from "./swr-config";

const config = { ...SWRConfig.defaultValue, ...defaultSWRConfig };
describe("shared buyer request recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves JSON and clears timeout after success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"saved":true}')),
    );
    await expect(fetcher("/api/saved-cars")).resolves.toEqual({ saved: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves status and cooldown without exposing server details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private database error", {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
      ),
    );
    await expect(fetcher("/api/scan")).rejects.toMatchObject({
      status: 429,
      retryAfter: 120_000,
      message: "Please wait a moment before trying again.",
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([400, 401, 402, 403, 404, 422])(
    "does not retry permanent HTTP %s errors",
    (status) => {
      const revalidate = vi.fn();
      const error = new HttpRequestError(status);
      expect(shouldRetryRequest(error)).toBe(false);
      retryRequest(error, "/api/scan", config, revalidate, {
        retryCount: 1,
        dedupe: true,
      });
      vi.runAllTimers();
      expect(revalidate).not.toHaveBeenCalled();
    },
  );
  it.each([429, 503])("honors HTTP %s cooldown", (status) => {
    const revalidate = vi.fn();
    retryRequest(
      new HttpRequestError(status, 120_000),
      "/api/scan",
      config,
      revalidate,
      { retryCount: 1, dedupe: true },
    );
    vi.advanceTimersByTime(119_999);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalledOnce();
  });
  it("waits a minute for unspecified rate-limit cooldowns", () => {
    const revalidate = vi.fn();
    retryRequest(new HttpRequestError(429), "/api/scan", config, revalidate, {
      retryCount: 1,
      dedupe: true,
    });
    vi.advanceTimersByTime(59_999);
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revalidate).toHaveBeenCalledOnce();
  });
  it("bounds transient retries and stops long suspensions", () => {
    const revalidate = vi.fn();
    retryRequest(new HttpRequestError(0), "/api/scan", config, revalidate, {
      retryCount: 1,
      dedupe: true,
    });
    retryRequest(new HttpRequestError(0), "/api/scan", config, revalidate, {
      retryCount: 4,
      dedupe: true,
    });
    retryRequest(
      new HttpRequestError(429, 86_400_001),
      "/api/scan",
      config,
      revalidate,
      { retryCount: 1, dedupe: true },
    );
    vi.advanceTimersByTime(5000);
    expect(revalidate).toHaveBeenCalledOnce();
  });
  it("aborts stalled requests and clears their timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      ),
    );
    const result = expect(fetcher("/api/scan")).rejects.toMatchObject({
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    new TypeError("Failed to fetch"),
    new SyntaxError("private JSON payload"),
  ])("sanitizes network and malformed-response failures", async (error) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(fetcher("/api/scan")).rejects.toMatchObject({
      status: 0,
      message:
        "We couldn't reach MIKEHUNT right now. Please try again shortly.",
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("parses seconds and HTTP dates and rejects invalid delays", () => {
    const now = Date.parse("2026-10-11T23:00:00Z");
    expect(retryAfterMs(" 60 ", now)).toBe(60_000);
    expect(retryAfterMs("Sun, 11 Oct 2026 23:02:00 GMT", now)).toBe(120_000);
    expect(retryAfterMs("Sun, 11 Oct 2026 22:00:00 GMT", now)).toBe(0);
    for (const value of [null, "", "nope", "-1", "1.5"])
      expect(retryAfterMs(value, now)).toBeUndefined();
  });

  it("sanitizes a malformed successful response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private malformed JSON")),
    );
    await expect(fetcher("/api/scan")).rejects.toMatchObject({ status: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps overlapping requests and their abort signals independent", async () => {
    let finishFirst: (response: Response) => void = () => {};
    const signals: AbortSignal[] = [];
    const mockedFetch = vi.fn((_url, init) => {
      signals.push(init.signal);
      return signals.length === 1
        ? new Promise<Response>((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(new Response('{"newer":true}'));
    });
    vi.stubGlobal("fetch", mockedFetch);
    const first = fetcher("/api/scan?state=MO");
    await expect(fetcher("/api/scan?state=KS")).resolves.toEqual({
      newer: true,
    });
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1].aborted).toBe(false);
    finishFirst(new Response('{"older":true}'));
    await expect(first).resolves.toEqual({ older: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
