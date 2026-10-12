"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import { WatchedDealerFeed } from "@/components/discovery/WatchedDealerFeed";
import { usePreferences } from "@/hooks/usePreferences";
import { discoverHomeState } from "@/lib/discovery/home-state";
import { ErrorState, LoadingState } from "@/components/shared/PageStates";

// The curated salvage/rebuilder/dealer NETWORK — browse every independent shop we crawl, categorized, with
// saved/imported inventory + accurate title-status mix, and ⭐ watch the ones you trust to follow their new listings.

const fetcher = (u: string) =>
  fetch(u).then((r) => {
    if (!r.ok) throw new Error("Dealer network unavailable");
    return r.json();
  });

interface Dealer {
  name: string;
  url: string;
  inventoryUrl?: string;
  host: string;
  inventoryHost?: string;
  state: string | null;
  type: string;
  typeLabel: string;
  accent: string;
  total: number;
  clean: number;
  rebuilt: number;
  salvage: number;
  parts: number;
}

const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All types" },
  { key: "rebuilder_dealer", label: "Rebuilder" },
  { key: "salvage_yard", label: "Salvage yard" },
  { key: "independent_dealer", label: "Independent" },
  { key: "auction_proxy", label: "Auction reseller" },
  { key: "clean_retail", label: "Clean retail" },
];

// A tiny stacked bar of the title mix so a dealer's inventory character reads at a glance.
function TitleMix({ d }: { d: Dealer }) {
  const segs = [
    { n: d.clean, c: "var(--green)", label: "clean" },
    { n: d.rebuilt, c: "var(--amber)", label: "rebuilt/repairable" },
    { n: d.salvage, c: "var(--red)", label: "salvage" },
    { n: d.parts, c: "var(--t4)", label: "parts-only" },
  ].filter((s) => s.n > 0);
  const total = segs.reduce((a, s) => a + s.n, 0) || 1;
  if (!segs.length) return null;
  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {segs.map((s, i) => (
          <div
            key={i}
            style={{ width: `${(s.n / total) * 100}%`, background: s.c }}
            title={`${s.n} ${s.label}`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--t4)]">
        {segs.map((s, i) => (
          <span key={i}>
            {s.n} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DealerNetworkPage() {
  const { data, error, mutate } = useSWR<{
    configured?: boolean;
    dealers: Dealer[];
    totalDealers: number;
    liveDealers: number;
    catalogedDealers?: number;
    message?: string;
  }>("/api/dealer-network", fetcher, { revalidateOnFocus: false });
  const watch = useDealerWatch();

  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [watchingOnly, setWatchingOnly] = useState(false);

  const dealers = data?.dealers ?? [];
  const states = useMemo(
    () =>
      Array.from(
        new Set(dealers.map((d) => d.state).filter(Boolean)),
      ).sort() as string[],
    [dealers],
  );
  const [state, setState] = useState("");
  const [stateTouched, setStateTouched] = useState(false);
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const homeState = prefsLoading
    ? ""
    : discoverHomeState(prefs.homeLocation, prefs.carsState);

  // Default the state filter to the saved home state (only once prefs have loaded, so the
  // list doesn't flash "All states" first). Falls back to All states when no shop is there.
  useEffect(() => {
    if (stateTouched || prefsLoading || !homeState) return;
    if (states.includes(homeState)) setState(homeState);
  }, [stateTouched, prefsLoading, homeState, states]);

  const shown = useMemo(() => {
    let r = dealers;
    if (type) r = r.filter((d) => d.type === type);
    if (state) r = r.filter((d) => d.state === state);
    if (watchingOnly) r = r.filter((d) => watch.has(d.host));
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      r = r.filter(
        (d) =>
          d.name.toLowerCase().includes(t) ||
          d.host.includes(t) ||
          (d.state || "").toLowerCase().includes(t),
      );
    }
    return r;
  }, [dealers, type, state, watchingOnly, q, watch]);

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[var(--t1)]">
          Dealer network
        </h1>
        <p className="mt-1 text-xs md:text-sm text-[var(--t4)]">
          {data
            ? `${data.totalDealers} independent salvage / rebuilder shops · ${data.liveDealers} with imported inventory`
            : error
              ? "Shop catalog unavailable right now."
              : "Loading the salvage & rebuilder network…"}
          {watch.count > 0 && ` · ⭐ ${watch.count} watched`}
        </p>
        {data && (
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--t4)]">
            {data.configured === false
              ? "Showing the dealer catalog. Inventory from these shops isn't imported yet."
              : "Vehicle counts come from saved / imported inventory, not a live feed."}
          </p>
        )}
      </div>

      <WatchedDealerFeed />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search dealer, site, state…"
          aria-label="Search dealers by name, site or state"
          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-[var(--s0)] border border-[var(--b1)] text-sm outline-none focus:border-[var(--b3)]"
        />
        <select
          value={state}
          onChange={(e) => {
            setStateTouched(true);
            setState(e.target.value);
          }}
          aria-label="Filter dealers by state"
          className="px-3 py-2 rounded-xl bg-[var(--s0)] border border-[var(--b1)] text-sm outline-none"
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => setWatchingOnly((v) => !v)}
          className="px-3 py-2 rounded-xl text-sm font-bold border transition-colors"
          style={{
            background: watchingOnly ? "var(--amber)" : "var(--s0)",
            color: watchingOnly ? "#000" : "var(--t3)",
            borderColor: watchingOnly ? "var(--amber)" : "var(--b1)",
          }}
        >
          ⭐ Watching{watch.count ? ` ${watch.count}` : ""}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
            style={{
              background: type === t.key ? "var(--grad)" : "var(--s2)",
              color: type === t.key ? "#fff" : "var(--t3)",
              border: "1px solid var(--b1)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {error && !data ? (
        <ErrorState
          compact
          title="Couldn't load the dealer network"
          message="The shop catalog didn't load. Try again in a moment."
          onRetry={() => mutate()}
        />
      ) : !data || prefsLoading ? (
        <LoadingState
          label="Loading the shop catalog…"
          variant="cards"
          count={6}
        />
      ) : (
        <>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--t4)]">
            {shown.length} shown
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((d) => {
              const on = watch.has(d.host);
              return (
                <div
                  key={d.host}
                  className="glass-panel p-4 flex flex-col gap-3"
                  style={{ padding: 16 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-[var(--t1)] truncate">
                        {d.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{
                            color: d.accent,
                            border: `1px solid ${d.accent}`,
                          }}
                        >
                          {d.typeLabel}
                        </span>
                        {d.state && (
                          <span className="text-[11px] text-[var(--t4)]">
                            {d.state}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => watch.toggle(d.host)}
                      aria-pressed={on}
                      title={on ? "Unwatch" : "Watch this dealer"}
                      className="shrink-0 h-8 w-8 grid place-items-center rounded-full text-sm transition-colors"
                      style={{
                        background: on ? "var(--amber)" : "var(--s2)",
                        color: on ? "#000" : "var(--t3)",
                        border: "1px solid var(--b2)",
                      }}
                    >
                      {on ? "★" : "☆"}
                    </button>
                  </div>

                  <div className="text-[13px] text-[var(--t2)]">
                    {d.total > 0 ? (
                      <span className="font-bold text-[var(--t1)]">
                        {d.total.toLocaleString()} imported{" "}
                        {d.total === 1 ? "vehicle" : "vehicles"}
                      </span>
                    ) : (
                      <span className="text-[var(--t4)]">
                        Cataloged, not imported yet
                      </span>
                    )}
                  </div>
                  {d.total === 0 && (
                    <p className="text-[11px] leading-relaxed text-[var(--t4)]">
                      In the dealer catalog. This shop&apos;s inventory
                      isn&apos;t imported into MikeHunt yet.
                    </p>
                  )}
                  <TitleMix d={d} />

                  <div className="mt-auto flex items-center gap-3">
                    {d.total > 0 && (
                      <Link
                        href={`/dealer-network/${d.host}`}
                        className="text-xs font-bold text-[var(--amber-d)] hover:underline"
                      >
                        View {d.total.toLocaleString()} in app →
                      </Link>
                    )}
                    <a
                      href={d.inventoryUrl || d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--t4)] hover:text-[var(--t2)]"
                    >
                      Visit inventory ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
