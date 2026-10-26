"use client";

import { useEffect, useRef } from "react";

export function MarketLoadMore({
  shown,
  total,
  hasMore,
  loading,
  failed,
  onLoadMore,
  onRetry,
  refreshing = false,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  refreshing?: boolean;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !hasMore ||
      loading ||
      failed ||
      !sentinel.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    let requested = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!requested && entries.some((entry) => entry.isIntersecting)) {
          requested = true;
          onLoadMore();
        }
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loading, failed, onLoadMore]);

  return (
    <div
      ref={sentinel}
      aria-label="More market vehicles"
      aria-busy={loading}
      style={{ overflowAnchor: "none" }}
      className="mt-4 flex min-h-24 flex-wrap items-center justify-between gap-3 border-t border-[var(--b1)] py-4"
    >
      <p role="status" className="text-sm text-[var(--t3)]">
        {failed
          ? "The vehicle list couldn’t update. Your current results are still here."
          : loading
            ? `${refreshing ? "Refreshing results" : "Loading more vehicles"}… ${shown} shown`
            : !hasMore && shown !== total
              ? `${shown.toLocaleString()} unique vehicles loaded · Results may have changed. Refresh to check again.`
              : `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} matching vehicles${!hasMore ? " · End of current results" : ""}`}
      </p>
      {(hasMore || failed || shown !== total) && (
        <button
          type="button"
          disabled={loading}
          onClick={failed || !hasMore ? onRetry : onLoadMore}
          className="min-h-11 rounded-xl border border-[var(--b1)] px-5 text-sm font-semibold text-[var(--t1)] disabled:opacity-50"
        >
          {failed
            ? "Retry loading vehicles"
            : loading
              ? refreshing
                ? "Refreshing results…"
                : "Loading vehicles…"
              : !hasMore
                ? "Refresh results"
                : "Load more vehicles"}
        </button>
      )}
    </div>
  );
}
