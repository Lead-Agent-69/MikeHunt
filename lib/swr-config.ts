import { SWRConfiguration } from "swr";

/**
 * Shared fetcher function for SWR
 * Throws an error if the response is not ok
 */
export const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
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
  shouldRetryOnError: true,
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
