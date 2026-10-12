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
    super("Failed to fetch");
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
  // Long provider suspensions require explicit recovery, not a timer that overflows or loops.
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

/**
 * Shared fetcher function for SWR
 * Throws an error if the response is not ok
 */
export const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok)
      throw new HttpRequestError(
        res.status,
        retryAfterMs(res.headers.get("Retry-After")),
      );
    return res.json();
  });

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
