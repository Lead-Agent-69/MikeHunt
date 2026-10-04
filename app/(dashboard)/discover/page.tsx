"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePreferences } from "@/hooks/usePreferences";
import {
  buildBuyerIntentQuery,
  buyerIntentLabel,
  normalizeBuyerIntent,
  readLocalBuyerIntent,
  type BuyerIntent,
} from "@/hooks/useBuyerIntent";
import { NearbyDeals } from "@/components/discovery/NearbyDeals";
import { MarketPicker } from "@/components/shared/MarketPicker";
import { RecentlyViewed } from "@/components/shared/RecentlyViewed";
import { WatchedDealerFeed } from "@/components/discovery/WatchedDealerFeed";
import useSWR from "swr";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SelectField } from "@/components/shared/Field";
import { EmptyState } from "@/components/shared/EmptyState";
import { US_STATES } from "@/lib/utils/titleRules";
import { US_STATES as STATE_NAMES } from "@/lib/geo/us-states";
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

const LANE_VALUE_TO_LABEL: Record<string, string> = {
  all: "All deals",
  damaged: "Salvage & repairable",
  auction: "Wholesale auctions",
  private: "Private & retail",
  "clean-retail": "Clean retail",
  government: "Repo / government",
  parts: "Parts / teardown",
  specialty: "Specialty",
};

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load discovery feed");
    return res.json();
  });

function Rail({ rail }: { rail: DiscoveryRail }) {
  const strip = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [edges, setEdges] = useState({ start: true, end: true });
  const railId = React.useId();
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft <= 2,
        end:
          element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [rail.deals.length]);
  const browse = (direction: number) => {
    const element = strip.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.85,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  };
  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-[var(--t1)]">
            {rail.title}
          </h2>
          {rail.subtitle && (
            <p className="mt-0.5 text-xs text-[var(--t4)]">{rail.subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Previous vehicles in ${rail.title}`}
            title="Previous vehicles"
            aria-controls={railId}
            disabled={edges.start}
            onClick={() => browse(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--b2)] text-[var(--t2)] disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Next vehicles in ${rail.title}`}
            title="Next vehicles"
            aria-controls={railId}
            disabled={edges.end}
            onClick={() => browse(1)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--b2)] text-[var(--t2)] disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <motion.div
        ref={strip}
        id={railId}
        role="region"
        aria-label={`${rail.title} vehicles`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            browse(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
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
  const searchParams = useSearchParams();
  const urlScope = React.useMemo(() => {
    const q = (searchParams.get("q") || "").toLowerCase().trim();
    const laneValue = (searchParams.get("lane") || "all").toLowerCase().trim();
    const stateParam = (searchParams.get("state") || "").toUpperCase().trim();
    const maxPriceParam = searchParams.get("maxPrice");
    const titleType = searchParams.get("titleType") || undefined;
    const sellerType = searchParams.get("sellerType") || undefined;
    const buyerMode = searchParams.get("mode") || undefined;
    const hasScope = Boolean(
      q ||
      (laneValue && laneValue !== "all") ||
      stateParam ||
      maxPriceParam ||
      titleType ||
      sellerType ||
      buyerMode,
    );
    if (!hasScope) return null;
    const maxPrice = Number(maxPriceParam || 0);
    return normalizeBuyerIntent({
      vehicleType: q || undefined,
      lane: LANE_VALUE_TO_LABEL[laneValue] || undefined,
      laneValue,
      state: stateParam || "Nationwide",
      titleType,
      sellerType,
      buyerMode,
      maxPrice:
        Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    });
  }, [searchParams]);
  const [state, setState] = useState(""); // '' = nationwide
  useEffect(() => {
    const chosen = searchParams.get("state");
    if (chosen !== null)
      setState(
        chosen.toUpperCase() === "NATIONWIDE" ? "" : chosen.toUpperCase(),
      );
    else if (searchParams.has("states")) setState("");
  }, [searchParams]);
  const [showInsights, setShowInsights] = useState(false);
  const [buyerScope, setBuyerScope] = useState<BuyerIntent | null>(urlScope);

  // Land on the user's saved default market once (they can still change it — this only sets the initial).
  const { prefs } = usePreferences();
  const prefsApplied = useRef(false);
  useEffect(() => {
    if (prefsApplied.current || !Object.keys(prefs).length) return;
    prefsApplied.current = true;
    if (urlScope) {
      if (urlScope.state && urlScope.state !== "Nationwide") {
        setState(urlScope.state);
      }
      return;
    }
    // Saved buyer scope (this device, then the account) wins over the older
    // carsState-only default so Discover does not drop lane, price, or state.
    const savedBuyerScope =
      readLocalBuyerIntent() || normalizeBuyerIntent(prefs.buyerScope);
    if (savedBuyerScope) {
      setBuyerScope(savedBuyerScope);
      if (savedBuyerScope.state && savedBuyerScope.state !== "Nationwide") {
        setState(savedBuyerScope.state);
      }
      return;
    }
    if (prefs.carsState) setState(prefs.carsState);
  }, [prefs, urlScope]);

  useEffect(() => {
    const syncScope = () =>
      setBuyerScope(
        urlScope ||
          readLocalBuyerIntent() ||
          normalizeBuyerIntent(prefs.buyerScope) ||
          null,
      );
    syncScope();
    window.addEventListener("mh-buyer-scope-change", syncScope);
    window.addEventListener("storage", syncScope);
    return () => {
      window.removeEventListener("mh-buyer-scope-change", syncScope);
      window.removeEventListener("storage", syncScope);
    };
  }, [urlScope, prefs.buyerScope]);

  useEffect(() => {
    if (buyerScope?.state && buyerScope.state !== "Nationwide") {
      setState((current) => current || buyerScope.state || "");
    }
  }, [buyerScope?.state]);

  const scopeParams = buildBuyerIntentQuery(buyerScope, state);
  if (searchParams.has("states")) {
    scopeParams.delete("state");
    scopeParams.set("states", searchParams.get("states") || "");
  } else if (searchParams.get("state")?.toUpperCase() === "NATIONWIDE") {
    scopeParams.delete("state");
  }
  const scopeQuery = scopeParams.toString() ? `?${scopeParams.toString()}` : "";
  const activeScopeLabel = buyerIntentLabel(buyerScope, state);

  const { data, error, isLoading } = useSWR<DiscoverResponse>(
    `/api/discover${scopeQuery}`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60_000,
      // Keep the current feed visible while switching state, instead of flashing to skeletons — seamless.
      keepPreviousData: true,
    },
  );

  const statLine = data?.previewMode
    ? `${data.totalListings.toLocaleString()} public preview rows · ${activeScopeLabel}`
    : data
      ? `${data.totalListings.toLocaleString()} listings · ${activeScopeLabel}`
      : null;
  const hasLiveListings = Boolean(data && data.totalListings > 0);
  const placeName = (() => {
    const code = (state || buyerScope?.state || "").toUpperCase();
    if (!code || code === "NATIONWIDE") return "Nationwide";
    return STATE_NAMES[code]?.[0] || code;
  })();
  const vehicleName = buyerScope?.vehicle || "vehicles";
  const budgetText = buyerScope?.maxPrice
    ? ` under $${Number(buyerScope.maxPrice).toLocaleString()}`
    : "";
  const emptyScopeMessage = `No ${vehicleName} in ${placeName}${budgetText} yet. Widen the state or raise the budget.`;
  const personalBuyer = buyerScope?.buyerMode === "personal";
  const hiddenPersonalRails = new Set([
    "roi",
    "salvage",
    "auctionLots",
    "fresh",
  ]);
  const visibleRails = (data?.rails || []).filter(
    (rail) => !personalBuyer || !hiddenPersonalRails.has(rail.key),
  );

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <h1 className="relative flex items-center gap-2.5 text-xl font-bold text-[var(--t1)] md:text-2xl">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ background: "var(--grad)" }}
            >
              <Sparkles
                className="h-4.5 w-4.5"
                strokeWidth={2.5}
                style={{ width: 18, height: 18 }}
              />
            </span>
            Discover
          </h1>
          <p className="mt-1.5 min-h-[18px] text-xs text-[var(--t4)] md:text-sm">
            {statLine ??
              (isLoading
                ? "Loading matching vehicles..."
                : "Find vehicles for your budget and buying goal")}
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
        <MarketPicker accent="var(--amber-d)" onPick={(st) => setState(st)} />
      )}

      <section className="flex flex-col gap-3 border-y border-[var(--b1)] py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
            Buying for
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--t1)]">
            {activeScopeLabel}
          </p>
          <p className="mt-1 text-xs text-[var(--t4)]">
            Refine makes and budgets without leaving your live results.
          </p>
        </div>
        <a
          href={`/scan${scopeQuery ? `${scopeQuery}&` : "?"}sort=profit`}
          className="inline-flex items-center justify-center rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-black text-[var(--t2)]"
        >
          Refine search
        </a>
      </section>

      <details
        className="border-b border-[var(--b1)] pb-3"
        onToggle={(event) => setShowInsights(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-[var(--t2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
          Market insights and saved interests
        </summary>
        {showInsights && (
          <div className="mt-4 space-y-6">
            {hasLiveListings && <EdgeBanner />}
            {/* Always show the saved dealer intent. Even before database import is live, this confirms the
          shops being watched and gives the user a direct path to source proof. */}
            <WatchedDealerFeed />

            {hasLiveListings && (
              <>
                {/* Jump back to deals you just looked at. */}
                <RecentlyViewed kind="car" accent="var(--amber-d)" />

                {/* Deals near you — personalized to the saved home market + surrounding states. */}
                <NearbyDeals />
              </>
            )}

            {/* Onboarding nudge — wire up preferences to unlock a personalized feed. */}
            {data && !data.personalized && (
              <a
                href="/settings"
                className="glass-panel flex items-center gap-3 px-4 py-3 transition-colors hover:border-[var(--amber-bd)]"
              >
                <div className="flex-1">
                  <p className="text-sm font-bold text-[var(--t1)]">
                    Personalize your feed
                  </p>
                  <p className="text-xs text-[var(--t4)]">
                    Set your states, budget & profit target in Settings to get a
                    “For You” rail tuned to how you buy.
                  </p>
                </div>
                <span className="text-xs font-bold text-[var(--amber)]">
                  Set up →
                </span>
              </a>
            )}

            {hasLiveListings && (
              <>
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
              </>
            )}

            {hasLiveListings && (
              <>
                {/* Flash deals — pinned urgency rail (self-fetching, hides when empty) */}
                <FlashRail state={state || undefined} />

                {/* Deal IQ intel rails — personalized + statistical (self-fetching, hide when empty) */}
                <IntelRail
                  endpoint="/api/recommendations"
                  title="Deals like your winners"
                  subtitle="Matched to the make/models you've actually profited on"
                />
                <IntelRail
                  endpoint={`/api/mispricing${state ? `?state=${state}` : ""}`}
                  title="Underpriced vs peers"
                  subtitle="Statistical outliers priced well under their cluster"
                />
                <IntelRail
                  endpoint="/api/deals/near"
                  title="Near you"
                  subtitle="Distance not available until a listing has real miles."
                />
              </>
            )}
          </div>
        )}
      </details>
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
      ) : !data || visibleRails.length === 0 ? (
        <div className="glass-panel" style={{ padding: 0 }}>
          <EmptyState
            icon="search"
            title="Nothing to discover yet"
            message={emptyScopeMessage}
          />
          <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-10">
            <button
              type="button"
              onClick={() => setState("")}
              className="min-h-12 rounded-lg border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)]"
            >
              Widen state
            </button>
            <a
              href="/onboarding"
              className="inline-flex min-h-12 items-center rounded-lg border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)]"
            >
              Raise budget
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {visibleRails.map((rail) => (
            <Rail key={rail.key} rail={rail} />
          ))}
        </div>
      )}
    </div>
  );
}
