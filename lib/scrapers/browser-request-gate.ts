import type { Route } from "playwright";
import { assertSourceAccess } from "./access-policy";
import { politeFetch, type PoliteResponse } from "./polite";

export const RENDER_MAX_REQUESTS = 40;
export const RENDER_MAX_BYTES = 8 * 1024 * 1024;
export const RENDER_TIMEOUT_MS = 60_000;

/** Browser requests never continue directly: public GETs use the shared guarded HTTP path. */
export function browserRequestGate(
  signal?: AbortSignal,
  deps: {
    fetch?: typeof politeFetch;
    assertAllowed?: typeof assertSourceAccess;
  } = {},
) {
  const fetch = deps.fetch ?? politeFetch;
  const assertAllowed = deps.assertAllowed ?? assertSourceAccess;
  const controller = new AbortController();
  const requestSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  let requests = 0;
  let bytes = 0;
  let failure: Error | undefined;
  const stop = (message: string) => {
    failure ??= new Error(message);
    controller.abort(failure);
  };
  const handler = async (route: Route) => {
    const request = route.request();
    if (
      request.method() !== "GET" ||
      !["document", "script", "xhr", "fetch"].includes(request.resourceType())
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    if (requestSignal.aborted) {
      await route.abort("blockedbyclient");
      return;
    }
    try {
      assertAllowed(undefined, request.url());
    } catch {
      await route.abort("blockedbyclient");
      return;
    }
    if (++requests > RENDER_MAX_REQUESTS) {
      stop("Rendered request budget exceeded");
      await route.abort("blockedbyclient");
      return;
    }
    try {
      const response: PoliteResponse = await fetch(request.url(), {
        signal: requestSignal,
        maxRetries: 0,
        timeoutMs: 10_000,
        accept:
          request.resourceType() === "script"
            ? "application/javascript,text/javascript,*/*;q=0.5"
            : undefined,
      });
      if (!response.ok || response.skipped || response.challenge) {
        stop("Rendered request denied or unavailable; no bypass attempted");
        await route.abort("blockedbyclient");
        return;
      }
      bytes += Buffer.byteLength(response.body);
      if (bytes > RENDER_MAX_BYTES) {
        stop("Rendered response budget exceeded");
        await route.abort("blockedbyclient");
        return;
      }
      requestSignal.throwIfAborted();
      // Never replay cookies or stale transport framing into the browser.
      const headers = Object.fromEntries(
        Object.entries(response.headers ?? {}).filter(
          ([key]) =>
            ![
              "set-cookie",
              "content-encoding",
              "content-length",
              "connection",
              "transfer-encoding",
            ].includes(key.toLowerCase()),
        ),
      );
      await route.fulfill({
        status: response.status,
        headers,
        body: response.body,
      });
    } catch {
      stop("Rendered request failed; no bypass attempted");
      await route.abort("blockedbyclient").catch(() => {});
    }
  };
  return {
    handler,
    assertHealthy() {
      if (failure) throw failure;
      requestSignal.throwIfAborted();
    },
    close() {
      controller.abort();
    },
    snapshot() {
      return { requests, bytes, failed: Boolean(failure) };
    },
  };
}
