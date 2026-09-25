"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { proxiedImage } from "@/lib/image-url";
import { usePreferences } from "@/hooks/usePreferences";
import { MyStatesButton } from "@/components/shared/MyStatesButton";

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
    <div className="fixed inset-0 top-14 overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-hide">
      {/* Floating "My States" chip — curate the feed to the states you care about. */}
      <div className="pointer-events-none fixed right-3 top-16 z-50">
        <div className="pointer-events-auto">
          <MyStatesButton
            onChange={rescope}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur hover:bg-black/70"
          />
        </div>
      </div>

      {items.map((it) => (
        <FeedCard key={it.id} it={it} />
      ))}
      <div ref={sentinel} className="h-2" />
      {items.length === 0 && loading && (
        <div className="grid h-full place-items-center text-white/50">
          Loading the feed…
        </div>
      )}
      {done && items.length === 0 && (
        <div className="grid h-full place-items-center px-8 text-center text-white/60">
          <div>
            <div className="mb-2 text-4xl">📍</div>
            <p className="font-bold text-white/80">
              No cars in your selected states yet
            </p>
            <p className="mt-1 text-sm">
              Tap “{scope?.length ? scope.join(", ") : "states"}” up top to add
              more.
            </p>
          </div>
        </div>
      )}
      {done && items.length > 0 && (
        <div className="flex h-[40vh] snap-start items-center justify-center text-white/40">
          You’re all caught up 🏁
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
    <section className="relative h-full min-h-full w-full snap-start snap-always overflow-hidden bg-black">
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
              🔥 BUY
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
            ✨ {it.forYouReason}
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
            {saved ? "❤️" : "🤍"}
          </span>
          <span className="text-[11px] font-bold text-white/90">Save</span>
        </button>
        <Link
          href={`/deal/${it.id}`}
          className="flex flex-col items-center gap-1"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-xl text-white backdrop-blur">
            📊
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
              🔗
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
          📍{" "}
          {[it.locationCity, it.locationState].filter(Boolean).join(", ") ||
            it.locationState ||
            "—"}
        </div>
        {actNow && (
          <span className="mt-2 inline-flex items-center rounded-full bg-[var(--red)] px-2.5 py-1 text-xs font-black text-white">
            🔥 Act now
            {it.prediction?.daysToSell
              ? ` · ~${it.prediction.daysToSell}d`
              : ""}
          </span>
        )}
      </div>
    </section>
  );
}
