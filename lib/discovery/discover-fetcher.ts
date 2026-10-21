import {
  fetcher as fetchJson,
  HttpRequestError,
  shouldRetryRequest,
} from "@/lib/swr-config";

type DiscoverFetchOptions<T> = {
  request?: (url: string) => Promise<T>;
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Keep a recoverable cold request inside SWR's loading state; never retry hard 4xx or 429 here. */
export async function fetchDiscoverFeed<T = unknown>(
  url: string,
  options: DiscoverFetchOptions<T> = {},
): Promise<T> {
  const request = options.request ?? (fetchJson as (url: string) => Promise<T>);
  try {
    return await request(url);
  } catch (error) {
    if (
      !shouldRetryRequest(error) ||
      (error instanceof HttpRequestError && error.status === 429)
    )
      throw error;
    await (options.wait ?? wait)(options.delayMs ?? 600);
    return request(url);
  }
}
