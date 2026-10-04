"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3, ExternalLink, Flame, Heart, MapPin } from "lucide-react";
import { proxiedImage } from "@/lib/image-url";
import { usePreferences } from "@/hooks/usePreferences";
import { MyStatesButton } from "@/components/shared/MyStatesButton";
import {
  EditorialCard,
  type EditorialCardData,
} from "@/components/ui/editorial-card";
import { DataSetupState } from "@/components/shared/DataSetupState";

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
  const { prefs } = usePreferences();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  // The state scope drives what the feed shows. Seeded from saved prefs; the picker updates it live.
  const [scope, setScope] = useState<string[] | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true;
    setLoading(true);
    try {
      const qs = scope && scope.length ? `&states=${scope.join(",")}` : "";
      const res = await fetch(`/api/feed?offset=${offset}&limit=12${qs}`);
      const data = await res.json();
      if (data.configured === false) {
        setConfigured(false);
        setDone(true);
        setItems([]);
        return;
      }
      setConfigured(true);
      const next: FeedItem[] = data.items || [];
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.filter((n) => !seen.has(n.id))];
      });
      setOffset(data.nextOffset ?? offset + 12);
      if (next.length === 0) setDone(true);
    } catch {
      /* transient */
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }, [offset, done, scope]);

  // Seed the scope from prefs once loaded (carsStates). Null = not-yet-known; [] = explicitly all.
  useEffect(() => {
    if (scope === null && prefs) setScope((prefs.carsStates as string[]) || []);
  }, [prefs, scope]);

  // Re-scope the feed when the chosen states change (reset the stream, refetch from the top).
  const rescope = useCallback((states: string[]) => {
    setScope(states);
    setItems([]);
    setOffset(0);
    setDone(false);
    busy.current = false;
  }, []);

  useEffect(() => {
    if (scope === null) return; // wait until we know the scope
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) loadMore();
      },
      { rootMargin: "1200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="relative left-1/2 min-h-[calc(100vh-56px)] w-screen -translate-x-1/2 snap-y snap-mandatory bg-black scrollbar-hide">
      {/* Floating "My States" chip — curate the feed to the states you care about. */}
      <div className="pointer-events-none sticky top-3 z-40 flex justify-end px-3 pt-3">
        <div className="pointer-events-auto">
          <MyStatesButton
            onChange={rescope}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur hover:bg-black/70"
          />
        </div>
      </div>

      {/* Editorial Cards — Featured deals grid */}
      {items.length > 0 && (
        <div className="snap-start min-h-screen bg-[var(--s1)] py-8 px-4">
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
                    category: it.source || "Deal",
                    year: it.year?.toString() || "",
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
                Live feed
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
              secondaryHref="/sources"
              secondaryLabel="Explore markets"
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
  const actNow = it.prediction?.urgency === "act_now";

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
      <div className="absolute bottom-36 right-3 flex flex-col items-center gap-6">
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
      <div className="absolute inset-x-0 bottom-0 p-5 pb-10 pr-20">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black text-white drop-shadow">
            {money(it.askPrice)}
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
        {actNow && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--red)] px-2.5 py-1 text-xs font-black text-white">
            <Flame className="h-3.5 w-3.5" strokeWidth={2.4} />
            Act now
            {it.prediction?.daysToSell
              ? ` · ~${it.prediction.daysToSell}d`
              : ""}
          </span>
        )}
      </div>
    </section>
  );
}
