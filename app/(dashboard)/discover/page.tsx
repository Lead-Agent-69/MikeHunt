"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";
import { savedScopeStates } from "@/lib/preferences/location-form";
import {
  applyBuyingForIntent,
  buildBuyerIntentQuery,
  buyerIntentLabel,
  discoverQueryForBuyingFor,
  normalizeBuyerIntent,
  readLocalBuyerIntent,
  writeLocalBuyerIntent,
  type BuyerIntent,
} from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { hiddenRailKeysForMode } from "@/lib/discovery/desk-rails";
import { NearbyDeals } from "@/components/discovery/NearbyDeals";
import { RecentlyViewed } from "@/components/shared/RecentlyViewed";
import { WatchedDealerFeed } from "@/components/discovery/WatchedDealerFeed";
import useSWR from "swr";
import { CoverageNotice } from "@/components/discovery/CoverageNotice";
import { ForYouRail } from "@/components/reco/ForYouRail";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { EmptyState } from "@/components/shared/EmptyState";
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
  const { prefs } = usePreferences();
  const urlScope = React.useMemo(() => {
    const q = (searchParams.get("q") || "").toLowerCase().trim();
    const laneValue = (searchParams.get("lane") || "all").toLowerCase().trim();
    const stateParam = (searchParams.get("state") || "").toUpperCase().trim();
    const maxPriceParam = searchParams.get("maxPrice");
    const titleType = searchParams.get("titleType") || undefined;
    const sellerType = searchParams.get("sellerType") || undefined;
    const buyerMode = searchParams.get("mode") || undefined;
    const makesParam = (searchParams.get("makes") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const hasScope = Boolean(
      q ||
      (laneValue && laneValue !== "all") ||
      stateParam ||
      searchParams.has("states") ||
      maxPriceParam ||
      titleType ||
      sellerType ||
      buyerMode ||
      makesParam.length,
    );
    if (!hasScope) return null;
    const savedBuyerScope =
      readLocalBuyerIntent() || normalizeBuyerIntent(prefs.buyerScope);
    const maxPrice = Number(maxPriceParam || 0);
    return normalizeBuyerIntent({
      ...savedBuyerScope,
      ...(searchParams.has("q")
        ? { vehicle: undefined, vehicleType: q || undefined }
        : {}),
      ...(searchParams.has("lane")
        ? { lane: LANE_VALUE_TO_LABEL[laneValue], laneValue }
        : {}),
      ...(stateParam || searchParams.has("states")
        ? {
            state:
              stateParam === "NATIONWIDE" || searchParams.has("states")
                ? "Nationwide"
                : stateParam,
          }
        : {}),
      ...(searchParams.has("titleType") ? { titleType } : {}),
      ...(searchParams.has("sellerType") ? { sellerType } : {}),
      ...(searchParams.has("mode") ? { buyerMode } : {}),
      ...(searchParams.has("maxPrice")
        ? {
            maxPrice:
              Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
          }
        : {}),
      ...(searchParams.has("makes")
        ? { makes: makesParam, preferredMakes: makesParam }
        : {}),
    });
  }, [searchParams, prefs.buyerScope]);
  const router = useRouter();
  const pathname = usePathname();
  const [showInsights, setShowInsights] = useState(false);
  const [buyerScope, setBuyerScope] = useState<BuyerIntent | null>(urlScope);
  const [makeDraft, setMakeDraft] = useState("");
  const [budgetDraft, setBudgetDraft] = useState("");
  const [laneDraft, setLaneDraft] = useState("all");
  const [stateDraft, setStateDraft] = useState("");

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

  const chosenState = searchParams.get("state");
  const savedStates = savedScopeStates(prefs);
  const selectedStates =
    searchParams.get("states") ??
    (chosenState === null && savedStates && savedStates.length > 1
      ? savedStates.join(",")
      : null);
  const state =
    chosenState !== null
      ? chosenState.toUpperCase() === "NATIONWIDE"
        ? ""
        : chosenState.toUpperCase()
      : selectedStates
        ? ""
        : savedStates
          ? savedStates[0] || ""
          : buyerScope?.state && buyerScope.state !== "Nationwide"
            ? buyerScope.state
            : effectiveHome(prefs)?.state || "";
  const scopeParams = buildBuyerIntentQuery(buyerScope, state);
  if (selectedStates) {
    scopeParams.delete("state");
    scopeParams.set("states", selectedStates);
  } else if (!state) {
    scopeParams.delete("state");
  }
  const scopeQuery = scopeParams.toString() ? `?${scopeParams.toString()}` : "";
  const marketLabel = selectedStates || state || "Nationwide";
  const activeScopeLabel = buyerIntentLabel(buyerScope, marketLabel);
  useEffect(() => {
    const makes = buyerScope?.makes?.length
      ? buyerScope.makes
      : buyerScope?.preferredMakes || [];
    setMakeDraft(makes[0] || "");
    setBudgetDraft(buyerScope?.maxPrice ? String(buyerScope.maxPrice) : "");
    setLaneDraft(buyerScope?.laneValue || "all");
    const scoped =
      buyerScope?.state && buyerScope.state !== "Nationwide"
        ? buyerScope.state
        : state;
    setStateDraft(/^[A-Z]{2}$/.test(scoped) ? scoped : "");
  }, [buyerScope, state]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<DiscoverResponse>(`/api/discover${scopeQuery}`, fetcher, {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60_000,
      // Keep the current feed visible while switching state, instead of flashing to skeletons — seamless.
      keepPreviousData: true,
    });

  const statLine = data?.previewMode
    ? `${data.uniqueVehicles.toLocaleString()} vehicles in preview`
    : data
      ? `${data.uniqueVehicles.toLocaleString()} matching vehicles`
      : null;
  const hasLiveListings = Boolean(data && data.totalListings > 0);
  const placeName = (() => {
    if (selectedStates)
      return selectedStates
        .split(",")
        .map((code) => STATE_NAMES[code]?.[0] || code)
        .join(", ");
    const code = state.toUpperCase();
    if (!code || code === "NATIONWIDE") return "Nationwide";
    return STATE_NAMES[code]?.[0] || code;
  })();
  const vehicleName = buyerScope?.vehicle || "vehicles";
  const budgetText = buyerScope?.maxPrice
    ? ` under $${Number(buyerScope.maxPrice).toLocaleString()}`
    : "";
  const emptyScopeMessage = `No ${vehicleName} in ${placeName}${budgetText} yet. Widen the state or raise the budget.`;
  const marketContext =
    data?.marketListings && data.marketListings > data.totalListings
      ? `${data.marketListings.toLocaleString()} active listings in ${placeName} after your price ceiling, before the remaining profile filters.`
      : null;
  // Personal, DIY, and parts are not flip desks — hide wholesale flip rails.
  // Reseller/dealer keep roi / salvage / auctionLots / fresh.
  const flipDesk = isFlipBuyerMode(buyerScope?.buyerMode);
  // Same table the API enforces (lib/discovery/desk-rails); parts keeps salvage/teardown.
  const hiddenNonFlipRails = hiddenRailKeysForMode(buyerScope?.buyerMode);
  const visibleRails = (data?.rails || []).filter(
    (rail) => flipDesk || !hiddenNonFlipRails.has(rail.key),
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
            {isValidating && data
              ? "Updating matching vehicles..."
              : (statLine ??
                (isLoading
                  ? "Loading matching vehicles..."
                  : "Find vehicles for your budget and buying goal"))}
          </p>
        </div>
      </div>

      <CoverageNotice coverage={data?.coverage} />

      <section className="border-y border-[var(--b1)] py-3">
        <form
          className="flex flex-col gap-3"
          aria-label="Buying for"
          onSubmit={(event) => {
            event.preventDefault();
            const budget = Number(budgetDraft.replace(/[^0-9]/g, ""));
            const next = applyBuyingForIntent(buyerScope, {
              make: makeDraft,
              maxPrice: Number.isFinite(budget) ? budget : 0,
              laneValue: laneDraft,
              state: stateDraft || "NATIONWIDE",
            });
            if (next) {
              writeLocalBuyerIntent(next);
              setBuyerScope(next);
            }
            const params = discoverQueryForBuyingFor(
              next,
              stateDraft || "NATIONWIDE",
            );
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, {
              scroll: false,
            });
          }}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
              Buying for
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--t1)]">
              {activeScopeLabel}
            </p>
            <p className="mt-1 text-xs text-[var(--t4)]">
              {marketContext ||
                "Refine makes and budgets without leaving your live results."}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-semibold text-[var(--t3)]">
              Make
              <input
                value={makeDraft}
                onChange={(event) => setMakeDraft(event.target.value)}
                placeholder="Any make"
                aria-label="Make"
                className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b1)] bg-[var(--s2)] px-3 text-sm font-semibold text-[var(--t1)] outline-none focus:border-[var(--b3)]"
              />
            </label>
            <label className="block text-xs font-semibold text-[var(--t3)]">
              Budget
              <input
                inputMode="numeric"
                value={budgetDraft}
                onChange={(event) =>
                  setBudgetDraft(event.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="Max price"
                aria-label="Budget"
                className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b1)] bg-[var(--s2)] px-3 text-sm font-semibold text-[var(--t1)] outline-none focus:border-[var(--b3)]"
              />
            </label>
            <label className="block text-xs font-semibold text-[var(--t3)]">
              Lane
              <select
                value={laneDraft}
                onChange={(event) => setLaneDraft(event.target.value)}
                aria-label="Lane"
                className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b1)] bg-[var(--s2)] px-3 text-sm font-semibold text-[var(--t1)] outline-none focus:border-[var(--b3)]"
              >
                {Object.entries(LANE_VALUE_TO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-[var(--t3)]">
              State
              <select
                value={stateDraft}
                onChange={(event) => setStateDraft(event.target.value)}
                aria-label="State"
                className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b1)] bg-[var(--s2)] px-3 text-sm font-semibold text-[var(--t1)] outline-none focus:border-[var(--b3)]"
              >
                <option value="">Nationwide</option>
                {Object.entries(STATE_NAMES)
                  .map(([code, info]) => ({ code, name: info[0] }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(({ code, name }) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-black text-[var(--t2)]"
            >
              View all matches & filters
            </button>
          </div>
        </form>
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
            {/* Flip-economics widgets (profit on the board, highest-margin spotlight, best flip,
                avg profit by model, "deals like your winners") are for reseller/dealer desks only. */}
            {hasLiveListings && flipDesk && <EdgeBanner />}
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
                    {flipDesk
                      ? "Set your states, budget & profit target in Settings to get a “For You” rail tuned to how you buy."
                      : "Set your states and budget in Settings to get a “For You” rail tuned to how you buy."}
                  </p>
                </div>
                <span className="text-xs font-bold text-[var(--amber)]">
                  Set up →
                </span>
              </a>
            )}

            {hasLiveListings && flipDesk && (
              <>
                {/* AI NEXT BEST BUY SNIPER — Real-time #1 highest-margin deal spotlight */}
                <NextBestBuySpotlight initialState={state || undefined} />

                {/* THE MONEY — count-up of profit on the table + today's best flip (the hero that lands) */}
                <DiscoverHero state={state || undefined} />

                {/* What the market's doing — top GO make/models by avg profit */}
                <MarketPulse />
              </>
            )}

            {hasLiveListings && (
              <>
                {/* Live ticker (Visor marquee) */}
                <DealTicker />

                {/* Market summary — at-a-glance intelligence (hides when empty) */}
                <MarketSummary />
              </>
            )}

            {hasLiveListings && (
              <>
                {/* Flash deals — pinned urgency rail (self-fetching, hides when empty) */}
                <FlashRail state={state || undefined} />

                {/* Deal IQ intel rails — personalized + statistical (self-fetching, hide when empty) */}
                {flipDesk && (
                  <IntelRail
                    endpoint="/api/recommendations"
                    title="Deals like your winners"
                    subtitle="Matched to the make/models you've actually profited on"
                  />
                )}
                <IntelRail
                  endpoint={`/api/mispricing${state ? `?state=${state}` : ""}`}
                  title="Underpriced vs peers"
                  subtitle="Statistical outliers priced well under their cluster"
                />
                <IntelRail
                  endpoint="/api/deals/near"
                  title={flipDesk ? "Near you" : "Listings in your home state"}
                  subtitle="Distance not available until a listing has real miles."
                />
              </>
            )}
          </div>
        )}
      </details>
      {/* For You: personal reco rail, hidden unless the backend is personalizing */}
      <ForYouRail flipDesk={flipDesk} />

      {/* Body */}
      {isLoading && !data ? (
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
            message="We couldn't update your vehicles. Check your connection and try again."
            action={{ label: "Try again", onClick: () => void mutate() }}
          />
        </div>
      ) : !data || visibleRails.length === 0 ? (
        <div className="glass-panel" style={{ padding: 0 }}>
          <EmptyState
            icon="search"
            className="!py-10 sm:!py-16"
            title="Nothing to discover yet"
            message={emptyScopeMessage}
          />
          <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-10">
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("states");
                params.set("state", "Nationwide");
                window.history.replaceState(null, "", `/discover?${params}`);
              }}
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
