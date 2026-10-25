"use client";

import { useEffect, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import type { MarketListing } from "@/lib/market/explorer";

export type MarketInventoryPage = {
  rows: MarketListing[];
  total: number;
  page: number;
  pageSize: number;
  [key: string]: any;
};

export const MARKET_BATCH_SIZE = 50;

export function marketInventoryKey(
  query: string | null,
  index: number,
  previous: MarketInventoryPage | null,
) {
  if (!query) return null;
  if (
    previous &&
    (!previous.rows.length ||
      (previous.page + 1) * previous.pageSize >= previous.total)
  )
    return null;
  const params = new URLSearchParams(query);
  params.set("pageSize", String(MARKET_BATCH_SIZE));
  params.set("page", String(index));
  return `/api/market/explore?${params}`;
}

export function useMarketInventory(
  query: string | null,
  requestedPages: number,
  fetcher: (url: string) => Promise<MarketInventoryPage>,
) {
  const result = useSWRInfinite<MarketInventoryPage>(
    (index, previous) => marketInventoryKey(query, index, previous),
    fetcher,
    {
      keepPreviousData: false,
      persistSize: false,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );
  const { setSize } = result;
  useEffect(() => {
    // Let the first page settle before restoring deeper batches. Resizing while
    // its initial request is running would start the same request twice.
    if (
      query &&
      result.data?.length &&
      !result.isValidating &&
      !result.error &&
      result.size !== requestedPages
    )
      void Promise.resolve(setSize(requestedPages)).catch(() => {});
  }, [
    query,
    requestedPages,
    setSize,
    result.data,
    result.isValidating,
    result.error,
    result.size,
  ]);

  const rows = useMemo(
    () =>
      Array.from(
        new Map(
          (result.data || [])
            .flatMap((page) => page.rows)
            .map((row) => [row.id, row]),
        ).values(),
      ),
    [result.data],
  );
  const latest = result.data?.at(-1);
  const hasMore = Boolean(
    latest && marketInventoryKey(query, latest.page + 1, latest),
  );
  return {
    data: latest,
    rows,
    error: rows.length ? undefined : result.error,
    loadMoreError: rows.length ? result.error : undefined,
    isLoading: result.isLoading,
    loadingMore: Boolean(
      result.data?.length &&
      (result.isValidating ||
        (!result.error && hasMore && requestedPages > result.data.length)),
    ),
    hasMore,
    mutate: result.mutate,
  };
}
