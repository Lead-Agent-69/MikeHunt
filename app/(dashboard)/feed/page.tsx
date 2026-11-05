"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { inventoryFreshnessValue } from "@/lib/search/inventory-freshness";
import { DiscoverySaveProvider } from "@/components/discovery/DiscoverySaveProvider";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { usePreferences } from "@/hooks/usePreferences";
import { useDealerId } from "@/hooks/useDealerId";
import { savedScopeStates } from "@/lib/preferences/location-form";
import {
  inventoryScopeStates,
  inventoryViewUnavailableReason,
} from "@/lib/search/inventory-view-scope";
import {
  InventoryViewLinks,
  InventoryViewNotice,
} from "@/components/search/InventoryViewLinks";
import { ErrorState } from "@/components/shared/PageStates";
import { DataSetupState } from "@/components/shared/DataSetupState";
import {
  FeedVehicleCard,
  type FeedVehicle,
} from "@/components/feed/FeedVehicleCard";

export default function FeedPage() {
  const { dealerId, loading, error } = useDealerId();
  const owner = loading || error ? null : (dealerId ?? "guest");
  return (
    <DiscoverySaveProvider>
      <FeedContents
        key={owner ?? "pending"}
        owner={owner}
        authReady={!loading}
      />
    </DiscoverySaveProvider>
  );
}

function FeedContents({
  owner,
  authReady,
}: {
  owner: string | null;
  authReady: boolean;
}) {
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
  const desk = prefs.buyerScope?.buyerMode ?? "";
  return (
    <FeedStream
      key={JSON.stringify([query, desk])}
      query={query}
      desk={desk}
      owner={owner}
      scopeReady={authReady && viewReady && !prefsLoading}
    />
  );
}

const RETURN_KEY = "mh-feed-return-v1";
const RETURN_MAX_AGE = 30 * 60 * 1000;
// Match the existing signed-in feed's maximum browsing depth.
const RETURN_MAX_ITEMS = 10000;
type FeedReturn = {
  owner: string;
  desk: string;
  query: string;
  url: string;
  at: number;
  items: FeedVehicle[];
  offset: number;
  done: boolean;
  boundedPool: boolean;
  capped: boolean;
  hiddenPhotos: number;
  failed: boolean;
  retryRefresh: boolean;
  anchor?: { id: string; top: number };
};

function readFeedReturn(
  owner: string | null,
  query: string,
  desk: string,
): FeedReturn | null {
  if (!owner) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null");
    if (
      saved?.owner === owner &&
      saved.query === query &&
      saved.desk === desk &&
      saved.url === window.location.pathname + window.location.search &&
      Number.isFinite(saved.at) &&
      saved.at <= Date.now() &&
      Date.now() - saved.at < RETURN_MAX_AGE &&
      Number.isSafeInteger(saved.offset) &&
      saved.offset >= 0 &&
      Array.isArray(saved.items) &&
      saved.items.length <= RETURN_MAX_ITEMS &&
      saved.items.every(
        (item: FeedVehicle) =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.source === "string",
      ) &&
      [
        saved.done,
        saved.boundedPool,
        saved.capped,
        saved.failed,
        saved.retryRefresh,
      ].every((value) => typeof value === "boolean") &&
      Number.isSafeInteger(saved.hiddenPhotos) &&
      saved.hiddenPhotos >= 0 &&
      (!saved.anchor ||
        (typeof saved.anchor.id === "string" &&
          Number.isFinite(saved.anchor.top)))
    )
      return saved;
  } catch {
    // Disabled or full session storage must not prevent browsing.
  }
  return null;
}

function FeedStream({
  query,
  desk,
  owner,
  scopeReady,
}: {
  query: string;
  desk: string;
  owner: string | null;
  scopeReady: boolean;
}) {
  const widerQuery = new URLSearchParams(query);
  const currentWindow = inventoryFreshnessValue(widerQuery.get("seenWithin"));
  const nextWindow = currentWindow === "3" ? "7" : "30";
  widerQuery.set("seenWithin", nextWindow);
  widerQuery.set("scope", "explicit");
  const viewIssue = inventoryViewUnavailableReason(
    new URLSearchParams(query),
    true,
  );
  const ready = scopeReady && !viewIssue;
  const [items, setItems] = useState<FeedVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [boundedPool, setBoundedPool] = useState(false);
  const [capped, setCapped] = useState(false);
  const [hiddenPhotos, setHiddenPhotos] = useState(0);
  const hidePhotoUnavailable = useCallback((id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
    setHiddenPhotos((previous) => previous + 1);
  }, []);
  const retryRefresh = useRef(false);
  const offset = useRef(0);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const stream = useRef<HTMLDivElement>(null);
  const latest = useRef<FeedReturn | null>(null);
  const restoring = useRef(false);
  const receivedPage = useRef(false);
  const detailAnchor = useRef<HTMLElement | null>(null);
  const [resume, setResume] = useState<FeedReturn["anchor"]>();

  useEffect(() => {
    if (!owner || !ready) return;
    latest.current = {
      owner,
      desk,
      query,
      url: window.location.pathname + window.location.search,
      at: Date.now(),
      items,
      offset: offset.current,
      done,
      boundedPool,
      capped,
      hiddenPhotos,
      failed,
      retryRefresh: retryRefresh.current,
    };
  }, [
    owner,
    desk,
    query,
    ready,
    items,
    done,
    boundedPool,
    capped,
    hiddenPhotos,
    failed,
  ]);

  const remember = useCallback((card?: HTMLElement | null) => {
    const snapshot = latest.current;
    if (
      !snapshot ||
      (!receivedPage.current && !snapshot.failed) ||
      restoring.current ||
      snapshot.items.length > RETURN_MAX_ITEMS
    )
      return;
    if (card) detailAnchor.current = card;
    const anchor =
      card ??
      detailAnchor.current ??
      Array.from(
        stream.current?.querySelectorAll<HTMLElement>("[data-feed-vehicle]") ??
          [],
      ).find((element) => element.getBoundingClientRect().bottom > 100);
    try {
      sessionStorage.setItem(
        RETURN_KEY,
        JSON.stringify({
          ...snapshot,
          at: Date.now(),
          anchor: anchor
            ? {
                id: anchor.dataset.feedVehicle,
                top: anchor.getBoundingClientRect().top,
              }
            : undefined,
        }),
      );
    } catch {
      // Continuity is optional when session storage is unavailable.
      try {
        sessionStorage.removeItem(RETURN_KEY);
      } catch {
        /* Storage disabled. */
      }
    }
  }, []);
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
      }
      const token = generation.current;
      const controller = new AbortController();
      request.current = controller;
      busy.current = true;
      setLoading(true);
      try {
        const cursor = reset ? 0 : offset.current;
        const response = await fetch(
          `/api/feed?${query}&browse=all&offset=${cursor}&limit=12`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (token !== generation.current || controller.signal.aborted) return;
        if (!response.ok || data.error || data.degraded)
          throw new Error("Feed unavailable");
        receivedPage.current = true;
        retryRefresh.current = false;
        setFailed(false);
        if (reset) setHiddenPhotos(0);
        const next: FeedVehicle[] = data.items || [];
        setItems((previous) => {
          const retained = reset ? [] : previous;
          const seen = new Set(retained.map((item) => item.id));
          const unique = next.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
          return [...retained, ...unique];
        });
        offset.current = data.nextOffset ?? cursor + 12;
        setDone(
          data.configured === false ||
            data.nextOffset == null ||
            Number(data.nextOffset) <= cursor,
        );
        setBoundedPool(Boolean(data.boundedPool));
        setCapped(Boolean(data.capped));
      } catch {
        if (token === generation.current && !controller.signal.aborted) {
          retryRefresh.current = reset;
          setFailed(true);
        }
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
    const saved = readFeedReturn(owner, query, desk);
    if (saved) {
      receivedPage.current = true;
      setLoading(false);
      setItems(saved.items);
      offset.current = saved.offset;
      setDone(saved.done);
      setBoundedPool(saved.boundedPool);
      setCapped(saved.capped);
      setHiddenPhotos(saved.hiddenPhotos);
      setFailed(saved.failed);
      retryRefresh.current = saved.retryRefresh;
      restoring.current = !!saved.anchor;
      setResume(saved.anchor);
      return cancelRequests;
    }
    setItems([]);
    setDone(false);
    setFailed(false);
    void loadMore(true);
    return cancelRequests;
    // Only a changed scope resets the stream, not pagination state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, desk, ready, owner, cancelRequests]);

  useLayoutEffect(() => {
    const save = () => remember();
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      remember();
    };
  }, [remember]);

  useEffect(() => {
    if (!resume) return;
    let frame = 0;
    let attempts = 0;
    let stable = 0;
    const restore = () => {
      const card = Array.from(
        stream.current?.querySelectorAll<HTMLElement>("[data-feed-vehicle]") ??
          [],
      ).find((element) => element.dataset.feedVehicle === resume.id);
      if (card) {
        const delta = card.getBoundingClientRect().top - resume.top;
        if (Math.abs(delta) > 1) {
          stable = 0;
          const root = document.scrollingElement || document.documentElement;
          // The dashboard can scroll its body independently of the document.
          const bodyScrolls =
            document.body.scrollTop > 0 ||
            /auto|scroll/.test(getComputedStyle(document.body).overflowY);
          const scroller = bodyScrolls ? document.body : root;
          scroller.scrollTo({
            top: scroller.scrollTop + delta,
            behavior: "instant",
          });
        } else stable++;
      }
      if (++attempts < 120 && stable < 2)
        frame = requestAnimationFrame(restore);
      else {
        restoring.current = false;
        setResume(undefined);
      }
    };
    frame = requestAnimationFrame(restore);
    const stop = () => {
      cancelAnimationFrame(frame);
      restoring.current = false;
      setResume(undefined);
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach((event) =>
      window.addEventListener(event, stop, { passive: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((event) => window.removeEventListener(event, stop));
    };
  }, [resume]);

  useEffect(() => {
    const node = sentinel.current;
    if (
      !node ||
      !ready ||
      restoring.current ||
      loading ||
      failed ||
      done ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    let active = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (active && entry.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [loadMore, ready, loading, failed, done, resume]);

  if (scopeReady && viewIssue)
    return (
      <InventoryViewNotice title="Feed" query={query} message={viewIssue} />
    );
  return (
    <div
      ref={stream}
      className="mx-auto max-w-6xl space-y-4"
      data-testid="feed-page"
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("a[href]"))
          remember(
            (event.target as HTMLElement).closest<HTMLElement>(
              "[data-feed-vehicle]",
            ),
          );
      }}
    >
      <header className="space-y-3 border-b border-[var(--b1)] pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--t1)]">Feed</h1>
            <p className="text-xs text-[var(--t3)]">
              Newest to DealerHunt first
            </p>
          </div>
          <button
            type="button"
            disabled={!ready || loading}
            onClick={() => {
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
        <InventoryViewLinks query={query} current="/feed" disabled={!ready} />
        {boundedPool && (
          <p role="status" className="text-xs text-[var(--t3)]">
            Up to 250 photo-backed matches for your search.
          </p>
        )}
        {capped && (
          <p role="status" className="text-xs text-[var(--t3)]">
            You reached this feed's browsing limit. Narrow your search to see
            more matches.
          </p>
        )}
      </header>
      <div className="space-y-6">
        {items.map((item, index) => (
          <FeedVehicleCard
            key={item.id}
            item={item}
            priority={index === 0}
            onPhotoUnavailable={hidePhotoUnavailable}
          />
        ))}
      </div>
      {hiddenPhotos > 0 && (
        <p role="status" className="text-sm text-[var(--t3)]">
          Some vehicles were hidden because their photos couldn't load.
        </p>
      )}
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
          onRetry={() => void loadMore(retryRefresh.current)}
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
      {!failed && !done && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadMore()}
          className="min-h-11 w-full border-t border-[var(--b1)] text-sm font-semibold text-[var(--blue)] disabled:opacity-50"
        >
          {loading
            ? "Loading more cars..."
            : !items.length
              ? "Check next vehicles"
              : "Load more cars"}
        </button>
      )}
      {done && !failed && (
        <section className="browse-panel flex flex-wrap items-center justify-between gap-3 p-4">
          <p role="status" className="text-sm text-[var(--t3)]">
            {items.length > 0
              ? "You’ve reached the end of this feed."
              : "Try widening your search."}
          </p>
          {currentWindow !== "30" && (
            <Link
              href={`/feed?${widerQuery}`}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent-surface)] px-4 text-sm font-semibold text-[var(--blue)]"
            >
              Include last {nextWindow} days
            </Link>
          )}
          <Link
            href={`/market?${query}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--blue)]"
          >
            See more in Market
          </Link>
        </section>
      )}
    </div>
  );
}
