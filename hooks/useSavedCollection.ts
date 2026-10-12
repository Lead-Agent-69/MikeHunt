"use client";
import useSWRInfinite from "swr/infinite";
import {
  fetchSavedPage,
  savedCollectionKey,
  type SavedPage,
} from "@/lib/saved/collection";

export function useSavedCollection<Row extends { id: string } = any>(
  ownerId: string | null,
  view: "page" | "checklist-page",
  filter = "all",
) {
  const result = useSWRInfinite<SavedPage>(
    (_index, previous: SavedPage | null) =>
      !ownerId || (previous && !previous.nextCursor)
        ? null
        : savedCollectionKey(ownerId, view, filter, previous?.nextCursor),
    fetchSavedPage,
    {
      keepPreviousData: false,
      persistSize: false,
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
      errorRetryCount: 1,
    },
  );
  const pages = result.data?.filter((page) => page.ownerId === ownerId);
  const data: Row[] | undefined = pages?.length
    ? (Array.from(
        new Map(
          pages.flatMap((page) => page.rows).map((row) => [row.id, row]),
        ).values(),
      ) as Row[])
    : undefined;
  const hasMore = Boolean(pages?.at(-1)?.nextCursor);
  const loadingMore =
    result.isValidating ||
    Boolean(!result.error && result.data && result.size > result.data.length);
  return {
    data,
    error: data?.length ? undefined : result.error,
    loadMoreError: data?.length ? result.error : undefined,
    isLoading: Boolean(ownerId && result.isLoading),
    hasMore,
    loadingMore,
    loadMore: () =>
      !loadingMore && (hasMore || result.error)
        ? result.error
          ? result.mutate()
          : result.setSize(result.size + 1)
        : Promise.resolve(),
    mutate: (update?: (rows: any[]) => any[], revalidate = true) =>
      update
        ? result.mutate(
            (current) =>
              current?.map((page) => ({ ...page, rows: update(page.rows) })),
            { revalidate },
          )
        : result.mutate(),
  };
}
