"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BarChart3,
  ExternalLink,
  Heart,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { proxiedImage } from "@/lib/image-url";
import { usePreferences } from "@/hooks/usePreferences";
import { savedScopeStates } from "@/lib/preferences/location-form";
import { MyStatesButton } from "@/components/shared/MyStatesButton";
import {
  EditorialCard,
  type EditorialCardData,
} from "@/components/ui/editorial-card";
import { DataSetupState } from "@/components/shared/DataSetupState";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";
import { displaySource, sourceMeta } from "@/lib/sources/source-meta";
import { inventoryScopeStates } from "@/lib/search/inventory-view-scope";

// The FEED — a full-screen, vertical snap-scroll stream of real car deals (TikTok for flips). Full-bleed
// photo, price + net-profit + forecast overlaid, a right-side action rail (save / details / source), and
// infinite scroll. Pulls the ranked photo-first feed from /api/feed.

interface FeedItem {
  id: string;
  source: string;
  sourceUrl?: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  image: string;
  askPrice: number;
  sellEstimate?: number | null;
  netProfit?: number | null;
  score?: number | null;
  verdict?: string;
  mileage?: number;
  condition?: string;
  locationCity?: string;
  locationState?: string;
  prediction?: {
    urgency?: string;
    daysToSell?: number | null;
    velocity?: string;
  } | null;
  forYouReason?: string;
}

const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "—";

export default function FeedPage() {
  const { query: viewQuery, ready: viewReady } = useInventoryViewScope();
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const savedScopeKey = JSON.stringify(savedScopeStates(prefs) || []);
  const [items, setItems] = useState<FeedItem[]>([]);
  const offset = useRef(0);
  const generation = useRef(0);
  const [boundedPool, setBoundedPool] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [done, setDone] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  // The state scope drives what the feed shows. Seeded from saved prefs; the picker updates it live.
  const [scope, setScope] = useState<string[] | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const query = useMemo(() => {
    const params = new URLSearchParams(viewQuery);
    if (scope !== null) {
      params.delete("state");
      params.set("states", scope.join(","));
    }
    return params.toString();
  }, [viewQuery, scope]);

  const loadMore = useCallback(
    async (reset = false) => {
      // The infinite-scroll observer can fire before the saved scope is known; an unscoped
      // first page would then win the race and ignore the user's states.
      if ((!reset && (busy.current || done)) || scope === null || !viewReady)
        return;
      if (reset) {
        generation.current++;
        offset.current = 0;
      }
      const requestGeneration = generation.current;
      busy.current = true;
      setLoading(true);
      try {
        const cursor = offset.current;
        const res = await fetch(`/api/feed?${query}&offset=${cursor}&limit=12`);
        const data = await res.json();
        if (requestGeneration !== generation.current) return;
        if (!res.ok || data.error || data.degraded)
          throw new Error("Feed unavailable");
        setLoadError(false);
        if (data.configured === false) {
          setConfigured(false);
          setDone(true);
          setItems([]);
          return;
        }
        setConfigured(true);
        setBoundedPool(Boolean(data.boundedPool));
        const next: FeedItem[] = data.items || [];
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...next.filter((n) => !seen.has(n.id))];
        });
        offset.current = data.nextOffset ?? cursor + 12;
        if (next.length === 0) setDone(true);
      } catch {
        if (requestGeneration === generation.current) setLoadError(true);
      } finally {
        if (requestGeneration === generation.current) {
          setLoading(false);
          busy.current = false;
        }
      }
    },
    [done, scope, query, viewReady],
  );

  // Seed the scope from prefs once loaded (carsStates mirror, else home + search locations).
  // Null = not-yet-known; [] = explicitly all.
  useEffect(() => {
    // Wait for /api/preferences: before it loads, prefs is {} and would seed "all states".
    if (!prefsLoading && viewReady) {
      const params = new URLSearchParams(viewQuery);
      setScope(
        inventoryScopeStates(params) ??
          (params.get("scope") === "explicit" ? [] : JSON.parse(savedScopeKey)),
      );
    }
  }, [savedScopeKey, prefsLoading, viewReady, viewQuery]);

  // Re-scope the feed when the chosen states change (reset the stream, refetch from the top).
  const rescope = useCallback((states: string[]) => {
    generation.current++;
    setScope(states);
    setItems([]);
    offset.current = 0;
    setDone(false);
    setLoadError(false);
    busy.current = false;
  }, []);

  useEffect(() => {
    if (scope === null || !viewReady) return;
    setItems([]);
    setDone(false);
    setLoadError(false);
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, viewReady]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting && !loadError) loadMore();
      },
      { rootMargin: "1200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, loadError]);

  return (
    <div className="relative left-1/2 min-h-[calc(100vh-56px)] w-screen -translate-x-1/2 snap-y snap-mandatory bg-black scrollbar-hide">
      {/* Floating "My States" chip — curate the feed to the states you care about. */}
      <div className="pointer-events-none sticky top-3 z-40 flex justify-end px-3 pt-3">
        <div className="pointer-events-auto">
          <InventoryViewLinks query={query} current="/feed" />
          <MyStatesButton
            onChange={rescope}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur hover:bg-black/70"
          />
        </div>
      </div>
      {boundedPool && (
        <p role="status" className="px-4 py-2 text-xs text-white">
          Personalized sample: up to 250 photo-backed matches.
        </p>
      )}

      {/* Editorial Cards — Featured deals grid */}
      {items.length > 0 && (
        <div className="snap-start bg-[var(--s1)] px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--t1)]">
                Featured Deals
              </h2>
              <span className="text-xs text-[var(--t4)]">
                Editorial showcase
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.slice(0, 6).map((it, index) => (
                <EditorialCard
                  key={`editorial-${it.id}`}
                  data={{
                    id: it.id,
                    image: proxiedImage(it.image),
                    title: it.title,
                    category: sourceMeta(displaySource(it.source, it.sourceUrl))
                      .label,
                    year: it.year?.toString() || "",
                    price: it.askPrice,
                    priceLabel: dealCardCopy(false).priceLabel(it.source),
                    description:
                      it.forYouReason ||
                      `${it.make} ${it.model} · ${it.locationCity}, ${it.locationState}`,
                    cta: "View Deal",
                    ctaLink: `/deal/${it.id}`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {items.map((it) => (
        <FeedCard key={it.id} it={it} />
      ))}
      <div ref={sentinel} className="h-2" />
      {loadError && !loading && (
        <div
          role="status"
          className="bg-[var(--s1)] px-6 py-10 text-center text-[var(--t1)]"
        >
          <p className="font-semibold">Feed temporarily unavailable</p>
          <p className="mt-2 text-sm text-[var(--t3)]">
            Your existing listings are still here. Try loading the next page
            again.
          </p>
          <button
            onClick={() => void loadMore()}
            className="mt-4 inline-flex min-h-12 items-center gap-2 px-4 font-semibold text-[var(--blue)]"
          >
            <RefreshCw size={16} aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {items.length === 0 && loading && configured !== false && (
        <div className="grid min-h-[calc(100vh-56px)] place-items-center bg-[var(--s1)] px-4">
          <div className="glass-panel w-full max-w-md p-5 text-center">
            <div className="mx-auto h-10 w-10 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] shimmer" />
            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
              Feed
            </p>
            <h1 className="mt-1 text-lg font-black text-[var(--t1)]">
              Building your review queue
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--t4)]">
              Loading photo-backed rows from the buyer scope and saved market
              preferences.
            </p>
          </div>
        </div>
      )}
      {done && items.length === 0 && configured === false && (
        <div className="min-h-[calc(100vh-56px)] bg-[var(--s1)] p-4 pt-8 md:p-8">
          <div className="mx-auto max-w-5xl space-y-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
                Feed
              </p>
              <h1 className="mt-1 text-2xl font-black text-[var(--t1)]">
                Build the feed from buyer intent
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                Feed is your fast review lane for photo-backed vehicles. It
                fills as MIKEHUNT finds matches for the market, vehicle type,
                and budget you selected.
              </p>
            </div>
            <DataSetupState
              title="Choose a market to start your Feed"
              message="Try Texas government trucks, Florida dealer SUVs, or salvage vehicles. When matching listings are available, Feed becomes a fast, photo-first review list."
              primaryHref="/discover"
              primaryLabel="Choose buyer scope"
              secondaryHref="/scan"
              secondaryLabel="Refine search"
            />
          </div>
        </div>
      )}
      {done && items.length === 0 && configured !== false && (
        <div className="min-h-[calc(100vh-56px)] bg-[var(--s1)] p-4 pt-8 md:p-8">
          <div className="mx-auto max-w-3xl">
            <DataSetupState
              title="No photo-ready feed items yet"
              message={`No vehicles match ${scope?.length ? scope.join(", ") : "the current market"} with enough photo proof for Feed. Broaden the market or run a smart source search from Discover.`}
              primaryHref="/discover"
              primaryLabel="Adjust buyer scope"
              secondaryHref="/scan?sort=profit"
              secondaryLabel="Open ranked scan"
            />
          </div>
        </div>
      )}
      {done && items.length > 0 && (
        <div className="flex h-[40vh] snap-start items-center justify-center text-white/40">
          You are all caught up
        </div>
      )}
    </div>
  );
}

function FeedCard({ it }: { it: FeedItem }) {
  const [saved, setSaved] = useState(false);
  const profitPos = it.netProfit != null && it.netProfit > 0;

  const save = async () => {
    if (saved) return;
    setSaved(true); // optimistic
    try {
      const res = await fetch("/api/saved-cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: it.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved to your garage");
    } catch {
      setSaved(false);
      toast.error("Sign in to save deals");
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-56px)] w-full snap-start snap-always overflow-hidden bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxiedImage(it.image)}
        alt={it.title}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      {/* Legibility scrims: top + bottom. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.92) 2%, transparent 42%, transparent 72%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* Top-left: verdict / score badge + a "For you" reason when the feed matched your taste. */}
      <div className="absolute left-4 top-4 flex max-w-[70%] flex-col items-start gap-2">
        <p className="rounded-lg bg-black/70 px-3 py-2 text-lg font-bold text-white">
          <span className="mr-2 text-xs font-normal">
            {dealCardCopy(false).priceLabel(it.source)}
          </span>
          {it.askPrice > 0 ? money(it.askPrice) : "Not reported"}
        </p>
        <div className="flex items-center gap-2">
          {it.verdict === "go" ? (
            <span className="rounded-full bg-[var(--green)] px-3 py-1 text-sm font-black text-black shadow-lg">
              BUY
            </span>
          ) : it.score != null ? (
            <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-black text-white backdrop-blur">
              {it.score}
            </span>
          ) : null}
        </div>
        {it.forYouReason && (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-black text-black shadow"
            style={{ background: "var(--home, #2dd4bf)" }}
          >
            {it.forYouReason}
          </span>
        )}
      </div>

      {/* Right action rail. */}
      <div className="absolute bottom-[calc(9rem+env(safe-area-inset-bottom))] right-3 flex flex-col items-center gap-6 md:bottom-36">
        <button
          onClick={save}
          className="flex flex-col items-center gap-1"
          aria-label="Save"
        >
          <span
            className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-2xl backdrop-blur transition-transform active:scale-90"
            style={{ color: saved ? "var(--red)" : "#fff" }}
          >
            <Heart
              className={saved ? "h-5 w-5 fill-current" : "h-5 w-5"}
              strokeWidth={2.4}
            />
          </span>
          <span className="text-[11px] font-bold text-white/90">Save</span>
        </button>
        <Link
          href={`/deal/${it.id}`}
          className="flex flex-col items-center gap-1"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-xl text-white backdrop-blur">
            <BarChart3 className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="text-[11px] font-bold text-white/90">Details</span>
        </Link>
        {it.sourceUrl && (
          <a
            href={it.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-xl text-white backdrop-blur">
              <ExternalLink className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="text-[11px] font-bold text-white/90">Listing</span>
          </a>
        )}
      </div>

      {/* Bottom info block. */}
      <div className="absolute inset-x-0 bottom-0 p-5 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pr-20 md:pb-10">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black text-white drop-shadow">
            {it.askPrice > 0 ? money(it.askPrice) : "Not reported"}
          </span>
          {profitPos && (
            <span className="text-base font-black text-[var(--green)] drop-shadow">
              +{money(it.netProfit)} profit
            </span>
          )}
        </div>
        <div className="mt-1 text-lg font-bold text-white drop-shadow">
          {[it.year, it.make, it.model].filter(Boolean).join(" ")}
        </div>
        <div className="mt-0.5 text-sm text-white/75">
          {it.mileage ? `${it.mileage.toLocaleString()} mi · ` : ""}
          <MapPin
            className="mr-1 inline h-3.5 w-3.5 align-[-2px]"
            strokeWidth={2.4}
          />
          {[it.locationCity, it.locationState].filter(Boolean).join(", ") ||
            it.locationState ||
            "—"}
        </div>
      </div>
    </section>
  );
}
