import { describe, expect, it, vi } from "vitest";
import type { Route } from "playwright";
import {
  browserRequestGate,
  RENDER_MAX_BYTES,
  RENDER_MAX_REQUESTS,
} from "./browser-request-gate";

function route(
  type = "document",
  method = "GET",
  url = "https://approved.example/inventory",
) {
  return {
    request: () => ({
      resourceType: () => type,
      method: () => method,
      url: () => url,
    }),
    abort: vi.fn().mockResolvedValue(undefined),
    fulfill: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn(),
  };
}
const response = {
  url: "https://approved.example/inventory",
  status: 200,
  body: "inventory",
  ok: true,
  fromCache: false,
  notModified: false,
};
const handle = (
  gate: ReturnType<typeof browserRequestGate>,
  r: ReturnType<typeof route>,
) => gate.handler(r as unknown as Route);

describe("browser requests use the shared guarded HTTP path", () => {
  it("fulfills document/script/XHR/fetch without a direct browser request or secret headers", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ...response,
      headers: {
        "content-type": "text/html",
        "Set-Cookie": "secret",
        "Content-Length": "999",
        "content-encoding": "gzip",
      },
    });
    const assertAllowed = vi.fn();
    const gate = browserRequestGate(undefined, { fetch, assertAllowed });
    for (const type of ["document", "script", "xhr", "fetch"]) {
      const r = route(type);
      await handle(gate, r);
      expect(r.continue).not.toHaveBeenCalled();
      expect(r.fulfill).toHaveBeenCalledWith({
        status: 200,
        body: "inventory",
        headers: { "content-type": "text/html" },
      });
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(assertAllowed).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      maxRetries: 0,
      timeoutMs: 10_000,
    });
    gate.assertHealthy();
  });

  it.each([
    ["image", "GET"],
    ["media", "GET"],
    ["stylesheet", "GET"],
    ["font", "GET"],
    ["fetch", "POST"],
  ])("blocks %s %s before collection", async (type, method) => {
    const fetch = vi.fn();
    const gate = browserRequestGate(undefined, {
      fetch,
      assertAllowed: vi.fn(),
    });
    const r = route(type, method);
    await handle(gate, r);
    expect(r.abort).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(r.continue).not.toHaveBeenCalled();
  });

  it("rechecks permission for every resource, without calling a disallowed host", async () => {
    const fetch = vi.fn();
    const gate = browserRequestGate(undefined, {
      fetch,
      assertAllowed: () => {
        throw new Error("permission");
      },
    });
    const r = route("script", "GET", "https://unapproved.example/app.js");
    await handle(gate, r);
    expect(fetch).not.toHaveBeenCalled();
    expect(r.abort).toHaveBeenCalled();
  });

  it("stops the render and all later requests on a challenge, breaker, robots denial or network failure", async () => {
    for (const result of [
      { ...response, ok: false, status: 429 },
      { ...response, ok: false, skipped: "breaker" },
      { ...response, ok: false, skipped: "robots" },
      { ...response, challenge: true },
      new Error("network"),
    ]) {
      const fetch = vi.fn();
      if (result instanceof Error) fetch.mockRejectedValue(result);
      else fetch.mockResolvedValue(result);
      const gate = browserRequestGate(undefined, {
        fetch,
        assertAllowed: vi.fn(),
      });
      await handle(gate, route());
      expect(() => gate.assertHealthy()).toThrow(/no bypass/);
      await handle(gate, route("xhr"));
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds request count and accumulated bytes, including concurrent resources", async () => {
    const fetch = vi.fn().mockResolvedValue(response);
    const gate = browserRequestGate(undefined, {
      fetch,
      assertAllowed: vi.fn(),
    });
    await Promise.all(
      Array.from({ length: RENDER_MAX_REQUESTS + 1 }, () =>
        handle(gate, route("fetch")),
      ),
    );
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(RENDER_MAX_REQUESTS);
    expect(() => gate.assertHealthy()).toThrow(/request budget/);
    const bigFetch = vi
      .fn()
      .mockResolvedValue({
        ...response,
        body: "x".repeat(RENDER_MAX_BYTES / 4),
      });
    const bigGate = browserRequestGate(undefined, {
      fetch: bigFetch,
      assertAllowed: vi.fn(),
    });
    await Promise.all(
      Array.from({ length: 5 }, () => handle(bigGate, route("script"))),
    );
    expect(() => bigGate.assertHealthy()).toThrow(/response budget/);
  });

  it("honors cancellation before and during collection", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort(new Error("job deadline"));
      return response;
    });
    const gate = browserRequestGate(controller.signal, {
      fetch,
      assertAllowed: vi.fn(),
    });
    const first = route();
    await handle(gate, first);
    expect(first.fulfill).not.toHaveBeenCalled();
    await handle(gate, route());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(() => gate.assertHealthy()).toThrow();
  });
});
