"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { usePreferences } from "@/hooks/usePreferences";
import { savedScopeStates } from "@/lib/preferences/location-form";
import { inventoryScopeStates } from "@/lib/search/inventory-view-scope";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
import { ErrorState } from "@/components/shared/PageStates";
import { DataSetupState } from "@/components/shared/DataSetupState";
import {
  FeedVehicleCard,
  type FeedVehicle,
} from "@/components/feed/FeedVehicleCard";

export default function FeedPage() {
  const { query: sharedQuery, ready: viewReady } = useInventoryViewScope();
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const savedScopeKey = JSON.stringify(savedScopeStates(prefs) || []);
  const query = useMemo(() => {
    const params = new URLSearchParams(sharedQuery);
    const states =
      inventoryScopeStates(params) ??
      (params.get("scope") === "explicit" ? [] : JSON.parse(savedScopeKey));
    params.delete("state");
    params.set("states", states.join(","));
    return params.toString();
  }, [sharedQuery, savedScopeKey]);
  const ready = viewReady && !prefsLoading;
  const [items, setItems] = useState<FeedVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [boundedPool, setBoundedPool] = useState(false);
  const offset = useRef(0);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const cancelRequests = useCallback(() => {
    generation.current++;
    request.current?.abort();
    busy.current = false;
  }, []);

  const loadMore = useCallback(
    async (reset = false) => {
      if (!ready || (!reset && (busy.current || done))) return;
      if (reset) {
        request.current?.abort();
        generation.current++;
        offset.current = 0;
      }
      const token = generation.current;
      const controller = new AbortController();
      request.current = controller;
      busy.current = true;
      setLoading(true);
      try {
        const cursor = offset.current;
        const response = await fetch(
          `/api/feed?${query}&offset=${cursor}&limit=12`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (token !== generation.current || controller.signal.aborted) return;
        if (!response.ok || data.error || data.degraded)
          throw new Error("Feed unavailable");
        setFailed(false);
        const next: FeedVehicle[] = data.items || [];
        setItems((previous) => {
          const seen = new Set(previous.map((item) => item.id));
          return [...previous, ...next.filter((item) => !seen.has(item.id))];
        });
        offset.current = data.nextOffset ?? cursor + 12;
        setDone(
          data.configured === false ||
            next.length === 0 ||
            data.nextOffset === null,
        );
        setBoundedPool(Boolean(data.boundedPool));
      } catch {
        if (token === generation.current && !controller.signal.aborted)
          setFailed(true);
      } finally {
        if (token === generation.current && !controller.signal.aborted) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [ready, done, query],
  );

  useEffect(() => {
    if (!ready) return;
    setItems([]);
    setDone(false);
    setFailed(false);
    void loadMore(true);
    return cancelRequests;
    // Only a changed scope resets the stream, not pagination state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ready, cancelRequests]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !failed) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, failed]);

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="feed-page">
      <header className="space-y-3 border-b border-[var(--b1)] pb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--t1)]">Feed</h1>
          <button
            type="button"
            disabled={!ready || loading}
            onClick={() => {
              setItems([]);
              void loadMore(true);
            }}
            title="Refresh feed"
            aria-label="Refresh feed"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)] disabled:opacity-40"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
        <InventoryViewLinks query={query} current="/feed" />
        {boundedPool && (
          <p role="status" className="text-xs text-[var(--t3)]">
            Up to 250 photo-backed matches for your search.
          </p>
        )}
      </header>
      <div className="space-y-6">
        {items.map((item, index) => (
          <FeedVehicleCard key={item.id} item={item} priority={index === 0} />
        ))}
      </div>
      {!items.length && (!ready || loading) && (
        <div
          aria-label="Loading feed"
          role="status"
          className="h-[480px] rounded-lg bg-[var(--s2)] shimmer"
        />
      )}
      {failed && !loading && (
        <ErrorState
          compact
          title="Feed temporarily unavailable"
          message="Your existing cars are still here. Try again when your connection is ready."
          onRetry={() => void loadMore()}
          retryLabel="Try again"
        />
      )}
      {done && !items.length && !failed && (
        <DataSetupState
          title="No photo-ready feed items yet"
          message="Some matching cars may still be waiting for photos. View all results or adjust your search."
          primaryHref={`/scan?${query}`}
          primaryLabel="View all results"
          secondaryHref="/discover"
          secondaryLabel="Adjust search"
        />
      )}
      <div ref={sentinel} className="h-1" aria-hidden="true" />
      {items.length > 0 && !done && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadMore()}
          className="min-h-11 w-full border-t border-[var(--b1)] text-sm font-semibold text-[var(--blue)] disabled:opacity-50"
        >
          {loading ? "Loading more cars..." : "Load more cars"}
        </button>
      )}
      {done && items.length > 0 && (
        <p role="status" className="py-6 text-center text-sm text-[var(--t3)]">
          You have reached the end of this photo-backed selection.
        </p>
      )}
    </div>
  );
}
