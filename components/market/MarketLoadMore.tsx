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
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
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
          ? "More vehicles couldn’t load. Your current results are still here."
          : loading
            ? `Loading more vehicles… ${shown} shown`
            : `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} matching vehicles${!hasMore ? " · You’re all caught up" : ""}`}
      </p>
      {(hasMore || failed) && (
        <button
          type="button"
          disabled={loading}
          onClick={failed ? onRetry : onLoadMore}
          className="min-h-11 rounded-xl border border-[var(--b1)] px-5 text-sm font-semibold text-[var(--t1)] disabled:opacity-50"
        >
          {failed
            ? "Retry loading vehicles"
            : loading
              ? "Loading vehicles…"
              : "Load more vehicles"}
        </button>
      )}
    </div>
  );
}
