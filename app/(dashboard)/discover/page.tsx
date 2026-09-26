"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { NearbyDeals } from "@/components/discovery/NearbyDeals";
import { MarketPicker } from "@/components/shared/MarketPicker";
import { RecentlyViewed } from "@/components/shared/RecentlyViewed";
import { WatchedDealerFeed } from "@/components/discovery/WatchedDealerFeed";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { SelectField } from "@/components/shared/Field";
import { EmptyState } from "@/components/shared/EmptyState";
import { US_STATES } from "@/lib/utils/titleRules";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { FlashRail } from "@/components/discovery/FlashRail";
import { IntelRail } from "@/components/discovery/IntelRail";
import { MarketSummary } from "@/components/discovery/MarketSummary";
import { DealTicker } from "@/components/home/DealTicker";
import { MarketPulse } from "@/components/home/MarketPulse";
import { DiscoverHero } from "@/components/discovery/DiscoverHero";
import { NextBestBuySpotlight } from "@/components/deal/NextBestBuySpotlight";
import { EdgeBanner } from "@/components/shared/EdgeBanner";
import type {
  DiscoverResponse,
  DiscoveryRail,
} from "@/components/discovery/types";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load discovery feed");
    return res.json();
  });

function Rail({ rail }: { rail: DiscoveryRail }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="px-1">
        <h2 className="text-lg font-bold leading-tight text-[var(--t1)]">
          {rail.title}
        </h2>
        {rail.subtitle && (
          <p className="mt-0.5 text-xs text-[var(--t4)]">{rail.subtitle}</p>
        )}
      </div>
      <motion.div
        className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {rail.deals.map((deal) => (
          <DiscoveryCard key={`${rail.key}-${deal.id}`} deal={deal} />
        ))}
      </motion.div>
    </motion.section>
  );
}

function RailSkeleton() {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <div className="h-5 w-40 rounded-[var(--r1)] shimmer" />
        <div className="mt-1.5 h-3 w-56 rounded-[var(--r1)] shimmer" />
      </div>
      <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="glass-panel overflow-hidden"
            style={{ padding: 0, width: 280, flex: "0 0 auto" }}
            aria-hidden="true"
          >
            <div className="aspect-[4/3] w-full shimmer" />
            <div className="flex flex-col gap-2 p-3.5">
              <div className="h-4 w-3/4 rounded-[var(--r1)] shimmer" />
              <div className="h-3 w-1/2 rounded-[var(--r1)] shimmer" />
              <div className="mt-1 h-6 w-1/3 rounded-[var(--r2)] shimmer" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DiscoverPage() {
  const [state, setState] = useState(""); // '' = nationwide

  // Land on the user's saved default market once (they can still change it — this only sets the initial).
  const { prefs } = usePreferences();
  const prefsApplied = useRef(false);
  useEffect(() => {
    if (prefsApplied.current || !Object.keys(prefs).length) return;
    prefsApplied.current = true;
    if (prefs.carsState) setState(prefs.carsState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  const { data, error, isLoading } = useSWR<DiscoverResponse>(
    `/api/discover${state ? `?state=${state}` : ""}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60_000,
      // Keep the current feed visible while switching state, instead of flashing to skeletons — seamless.
      keepPreviousData: true,
    },
  );

  const statLine = data
    ? `${data.totalListings.toLocaleString()} listings · ${data.uniqueVehicles.toLocaleString()} unique vehicles · merged ${data.mergedDuplicates.toLocaleString()} duplicates`
    : null;

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Your edge today — the live opportunity on the board right now. */}
      <EdgeBanner />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <div className="absolute -inset-4 bg-[var(--amber-lo)] blur-[32px] rounded-full opacity-50 pointer-events-none" />
          <h1 className="relative flex items-center gap-2.5 text-xl font-bold text-[var(--t1)] md:text-2xl">
            <motion.span
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ background: "var(--grad)" }}
            >
              <Sparkles
                className="h-4.5 w-4.5"
                strokeWidth={2.5}
                style={{ width: 18, height: 18 }}
              />
            </motion.span>
            Discover
          </h1>
          <p className="mt-1.5 min-h-[18px] text-xs text-[var(--t4)] md:text-sm">
            {statLine ??
              (isLoading
                ? "Scanning the market…"
                : "Graded, deduped deals across every source")}
          </p>
        </div>

        <SelectField
          options={[
            { value: "", label: "Nationwide" },
            ...US_STATES.map((s: string) => ({ value: s, label: s })),
          ]}
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="w-full bg-[var(--s0)] sm:w-44"
        />
      </div>

      {/* Guided first-run: no market chosen yet → pick it here and the feed personalizes instantly. */}
      {!state && (
        <MarketPicker
          accent="var(--amber-d)"
          onPick={(st) => setState(st)}
        />
      )}

      {/* New listings from the salvage/rebuilder dealers you watch. */}
      <WatchedDealerFeed />

      {/* Jump back to deals you just looked at. */}
      <RecentlyViewed kind="car" accent="var(--amber-d)" />

      {/* Deals near you — personalized to the saved home market + surrounding states. */}
      <NearbyDeals />

      {/* Onboarding nudge — wire up preferences to unlock a personalized feed. */}
      {data && !data.personalized && (
        <a
          href="/settings"
          className="glass-panel flex items-center gap-3 px-4 py-3 transition-colors hover:border-[var(--amber-bd)]"
        >
          <span className="text-lg">⭐</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-[var(--t1)]">
              Personalize your feed
            </p>
            <p className="text-xs text-[var(--t4)]">
              Set your states, budget & profit target in Settings to get a “For
              You” rail tuned to how you buy.
            </p>
          </div>
          <span className="text-xs font-bold text-[var(--amber)]">
            Set up →
          </span>
        </a>
      )}

      {/* AI NEXT BEST BUY SNIPER — Real-time #1 highest-margin deal spotlight */}
      <NextBestBuySpotlight initialState={state || undefined} />

      {/* THE MONEY — count-up of profit on the table + today's best flip (the hero that lands) */}
      <DiscoverHero state={state || undefined} />

      {/* Live ticker (Visor marquee) */}
      <DealTicker />

      {/* Market summary — at-a-glance intelligence (hides when empty) */}
      <MarketSummary />

      {/* What the market's doing — top GO make/models */}
      <MarketPulse />

      {/* Flash deals — pinned urgency rail (self-fetching, hides when empty) */}
      <FlashRail state={state || undefined} />

      {/* Deal IQ intel rails — personalized + statistical (self-fetching, hide when empty) */}
      <IntelRail
        endpoint="/api/recommendations"
        title="🏆 Deals like your winners"
        subtitle="Matched to the make/models you've actually profited on"
      />
      <IntelRail
        endpoint={`/api/mispricing${state ? `?state=${state}` : ""}`}
        title="📉 Underpriced vs peers"
        subtitle="Statistical outliers priced well under their cluster"
      />
      <IntelRail
        endpoint="/api/deals/near"
        title="📍 Near you"
        subtitle="Closest BUY deals to your home base — set your ZIP in Settings"
      />

      {/* Body */}
      {isLoading ? (
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <RailSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="glass-panel" style={{ padding: 0 }}>
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load discovery"
            message="Something went wrong fetching the market feed. Try again in a moment."
          />
        </div>
      ) : !data || data.rails.length === 0 ? (
        <div className="glass-panel" style={{ padding: 0 }}>
          <EmptyState
            icon="search"
            title="Nothing to discover yet"
            message={
              state
                ? `No active deals in ${state} right now. Try nationwide or run the scanner.`
                : "No active deals to browse yet. Run the scanner to populate the feed."
            }
            action={{ label: "Open scanner", href: "/scan" }}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {data.rails.map((rail) => (
            <Rail key={rail.key} rail={rail} />
          ))}
        </div>
      )}
    </div>
  );
}
