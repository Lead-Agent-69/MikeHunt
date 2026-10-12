import { SWRConfiguration } from "swr";

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const delay = /^\d+$/.test(trimmed)
    ? Number(trimmed) * 1000
    : /[a-z]/i.test(trimmed)
      ? Date.parse(trimmed) - now
      : NaN;
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

export class HttpRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(
      status === 401
        ? "Your session needs attention. Sign in again, then try once more."
        : status === 403
          ? "Your account doesn't have access to this. Please return to your workspace."
          : status === 404
            ? "This item is no longer available. Refresh the list or try another item."
            : status === 429
              ? "Please wait a moment before trying again."
              : status === 408
                ? "This is taking longer than expected. Please try again."
                : status >= 400 && status < 500
                  ? "We couldn't complete that request. Please check your choices and try again."
                  : "We couldn't reach MIKEHUNT right now. Please try again shortly.",
    );
    this.name = "HttpRequestError";
  }
}

function requestStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return;
  return typeof error.status === "number" ? error.status : undefined;
}

export function shouldRetryRequest(error: unknown): boolean {
  const status = requestStatus(error);
  return !(
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

export const retryRequest: NonNullable<SWRConfiguration["onErrorRetry"]> = (
  error,
  _key,
  config,
  revalidate,
  options,
) => {
  if (
    !shouldRetryRequest(error) ||
    options.retryCount > (config.errorRetryCount ?? 3)
  )
    return;
  const minimum =
    error instanceof HttpRequestError ? error.retryAfter : undefined;
  // Long suspensions need explicit recovery, not an overflowing timer or retry loop.
  if (minimum !== undefined && minimum > 86_400_000) return;
  const backoff =
    (config.errorRetryInterval ?? 5000) *
    2 ** Math.min(Math.max(options.retryCount - 1, 0), 8) *
    (1 + Math.random() * 0.5);
  const delay = Math.max(
    backoff,
    minimum ?? (requestStatus(error) === 429 ? 60_000 : 0),
  );
  setTimeout(() => revalidate(options), delay);
};

export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Shared fetcher function for SWR
 * Throws an error if the response is not ok
 */
export const fetcher = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok)
      throw new HttpRequestError(
        res.status,
        retryAfterMs(res.headers.get("Retry-After")),
      );
    return await res.json();
  } catch (error) {
    if (error instanceof HttpRequestError) throw error;
    throw new HttpRequestError(controller.signal.aborted ? 408 : 0);
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Default SWR configuration
 * Used across all pages for consistent behavior
 */
export const defaultSWRConfig: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60000, // 1 minute
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  shouldRetryOnError: shouldRetryRequest,
  onErrorRetry: retryRequest,
};

/**
 * Configuration for real-time data (scan results, live updates)
 * More frequent revalidation
 */
export const realtimeSWRConfig: SWRConfiguration = {
  ...defaultSWRConfig,
  dedupingInterval: 30000, // 30 seconds
  revalidateOnFocus: true, // Refresh when user returns
  refreshInterval: 60000, // Auto-refresh every minute
};

/**
 * Configuration for slow-changing data (settings, quotes)
 * Less frequent revalidation to reduce API calls
 */
export const staticSWRConfig: SWRConfiguration = {
  ...defaultSWRConfig,
  dedupingInterval: 300000, // 5 minutes
  revalidateOnReconnect: false,
  revalidateOnFocus: false,
};

/**
 * Configuration for frequently updated data (saved cars, watchlists)
 * Balanced revalidation strategy
 */
export const dynamicSWRConfig: SWRConfiguration = {
  ...defaultSWRConfig,
  dedupingInterval: 30000, // 30 seconds
  revalidateOnFocus: true, // Refresh when user returns
};
