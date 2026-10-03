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
import {
  BellRing,
  Clock,
  Compass,
  FileCheck,
  Gavel,
  Sparkles,
} from "lucide-react";
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
import { BuyerScopeBuilder } from "@/components/discovery/BuyerScopeBuilder";
import { SetupStatusPanel } from "@/components/discovery/SetupStatusPanel";
import { NextBestBuySpotlight } from "@/components/deal/NextBestBuySpotlight";
import { EdgeBanner } from "@/components/shared/EdgeBanner";
import { DNACarousel, type CarouselItem } from "@/components/ui/dna-carousel";
import {
  PremiumCarousel,
  type PremiumCarouselItem,
} from "@/components/ui/premium-carousel";
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

const DAILY_WORKFLOW = [
  {
    label: "Discover",
    href: "/discover",
    icon: Compass,
    title: "Choose a buying scope",
    detail: "Vehicle, state, budget, title, seller, and watched dealers.",
  },
  {
    label: "Deal Check",
    href: "/deal-check",
    icon: FileCheck,
    title: "Verify one listing",
    detail: "Paste a VIN, URL, or deal sheet before you spend time.",
  },
  {
    label: "Auction Lane",
    href: "/lane",
    icon: Gavel,
    title: "Operate a live lane",
    detail: "Review ceilings, inspection gaps, and outcome actions.",
  },
  {
    label: "Saved",
    href: "/saved",
    icon: BellRing,
    title: "Save what can move",
    detail: "Track listings, saved searches, dealers, and alerts.",
  },
  {
    label: "Pipeline",
    href: "/fleet",
    icon: Clock,
    title: "Manage acquired units",
    detail: "Recon, costs, status, and outcomes after purchase.",
  },
];

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

function PreviewProofStrip({
  proof,
  query,
}: {
  proof: NonNullable<DiscoverResponse["previewProof"]>;
  query: string;
}) {
  if (!proof.length) return null;
  const label: Record<string, string> = {
    govdeals: "GovDeals",
    publicsurplus: "PublicSurplus",
    municibid: "Municibid",
    copart: "Copart",
    iaa: "IAA",
    "ae-of-miami": "AE of Miami",
    "damage-com": "Damage.com",
    "dg-auto": "D&G Auto",
    recar: "ReCar",
    "stjames-auto": "St. James",
  };
  return (
    <section className="glass-panel p-3 md:p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
            Public source proof
          </p>
          <p className="mt-0.5 text-xs text-[var(--t4)]">
            Live rows read before anything is saved to the database.
          </p>
        </div>
        <a
          href="/sources"
          className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline"
        >
          Sources
        </a>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {proof.map((item) => {
          const working = item.status === "working";
          const blocked = item.status === "blocked";
          return (
            <a
              key={item.id}
              href={`/scan${query ? `${query}&` : "?"}source=${item.id}&sort=profit`}
              className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-[var(--t1)]">
                  {label[item.id] || item.id}
                </span>
                <span
                  className={
                    working
                      ? "font-black text-[var(--green)]"
                      : blocked
                        ? "font-black text-[var(--red)]"
                        : "font-black text-[var(--amber-d)]"
                  }
                >
                  {working ? "Working" : blocked ? "Blocked" : "No rows"}
                </span>
              </div>
              <div className="mt-1 font-semibold text-[var(--t3)]">
                {item.matchedRows.toLocaleString()} matched ·{" "}
                {item.rows.toLocaleString()} read
              </div>
              {item.detail && (
                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--t5)]">
                  {item.detail}
                </div>
              )}
            </a>
          );
        })}
      </div>
    </section>
  );
}

function DailyWorkflowStrip({ scopeQuery }: { scopeQuery: string }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {DAILY_WORKFLOW.map((job) => {
        const Icon = job.icon;
        const href =
          scopeQuery &&
          ["Discover", "Deal Check", "Auction Lane"].includes(job.label)
            ? `${job.href}${scopeQuery}`
            : job.href;
        return (
          <a
            key={job.label}
            href={href}
            className="group rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-3 transition-colors hover:border-[var(--b3)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                <Icon
                  className="h-3.5 w-3.5 text-[var(--amber)]"
                  strokeWidth={2.4}
                />
                {job.label}
              </span>
              <span className="text-[11px] font-black text-[var(--t5)] transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </div>
            <div className="mt-2 text-sm font-black text-[var(--t1)]">
              {job.title}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
              {job.detail}
            </p>
          </a>
        );
      })}
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
  const [buyerScope, setBuyerScope] = useState<BuyerIntent | null>(urlScope);

  // Land on the user's saved default market once (they can still change it — this only sets the initial).
  const { prefs } = usePreferences();
  const prefsApplied = useRef(false);
  useEffect(() => {
    if (prefsApplied.current || !Object.keys(prefs).length) return;
    prefsApplied.current = true;
    if (urlScope?.state && urlScope.state !== "Nationwide") {
      setState(urlScope.state);
      return;
    }
    if (prefs.carsState) setState(prefs.carsState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

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
      ? `${data.totalListings.toLocaleString()} listings · ${data.uniqueVehicles.toLocaleString()} unique vehicles · merged ${data.mergedDuplicates.toLocaleString()} duplicates`
      : null;
  const hasLiveListings = Boolean(data && data.totalListings > 0);

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Your edge today — the live opportunity on the board right now. */}
      {hasLiveListings && <EdgeBanner />}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
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
        <MarketPicker accent="var(--amber-d)" onPick={(st) => setState(st)} />
      )}

      <BuyerScopeBuilder initialScope={urlScope} />

      <DailyWorkflowStrip scopeQuery={scopeQuery} />

      <section className="glass-panel flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
            Active buying scope
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--t1)]">
            {activeScopeLabel}
          </p>
          <p className="mt-1 text-xs text-[var(--t4)]">
            Discover, source proof, and matching Scan links use this same scope.
          </p>
        </div>
        <a
          href={`/scan${scopeQuery ? `${scopeQuery}&` : "?"}sort=profit`}
          className="inline-flex items-center justify-center rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-black text-[var(--t2)]"
        >
          Analyze this scope
        </a>
      </section>

      {/* DNA Carousel — Featured deals showcase */}
      {data?.rails && data.rails.length > 0 && (
        <div className="glass-panel p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--t1)]">
              Featured Deals
            </h2>
            <span className="text-xs text-[var(--t4)]">
              Live candidates for this scope
            </span>
          </div>
          <DNACarousel
            items={data.rails[0].deals.slice(0, 5).map((deal: any) => ({
              id: deal.id,
              image:
                deal.images?.[0] ||
                deal.image_url ||
                deal.image ||
                "/images/car-placeholder.jpg",
              title:
                deal.title ||
                `${deal.year || ""} ${deal.make || ""} ${deal.model || ""}`.trim(),
              subtitle:
                deal.locationState || deal.mileage
                  ? [
                      deal.locationState,
                      deal.mileage
                        ? `${deal.mileage.toLocaleString()} miles`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : undefined,
              category: deal.dealVerdict?.toUpperCase() || deal.source,
              description:
                deal.trueNetProfit && deal.trueNetProfit > 0
                  ? `Net profit: $${deal.trueNetProfit.toLocaleString()}`
                  : deal.askPrice
                    ? `Current bid: $${deal.askPrice.toLocaleString()}`
                    : undefined,
              cta: "View Deal",
              ctaLink:
                deal.id?.startsWith?.("live-") && deal.sourceUrl
                  ? deal.sourceUrl
                  : `/deal/${deal.id}`,
            }))}
            autoPlay={true}
            autoPlaySpeed={4000}
            depth={250}
            curve={0.8}
            helixSpread={0.8}
            perspective={1200}
            imageWidth={240}
            imageHeight={320}
            imageRadius={16}
            blur={5}
            rgbSplit={2}
            inactiveOpacity={0.3}
            shadow={true}
            shadowStrength={0.2}
          />
        </div>
      )}

      {data && (
        <SetupStatusPanel
          configured={data.configured}
          previewMode={data.previewMode}
          previewCount={data.previewCount || data.totalListings || 0}
        />
      )}

      {data?.previewMode && data.previewProof && (
        <PreviewProofStrip proof={data.previewProof} query={scopeQuery} />
      )}

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
              Set your states, budget & profit target in Settings to get a “For
              You” rail tuned to how you buy.
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
            subtitle="Closest BUY deals to your home base — set your ZIP in Settings"
          />
        </>
      )}

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
              data?.configured === false
                ? "Connect Supabase inventory and source ingestion to populate real salvage, wholesale, private, retail, repo, and specialty deals."
                : state
                  ? `No active deals in ${state} right now. Try nationwide or adjust your search.`
                  : "No active deals to browse yet. Adjust your search or connect source ingestion."
            }
            action={{
              label:
                data?.configured === false
                  ? "Open data sources"
                  : "Open scanner",
              href: data?.configured === false ? "/sources" : "/scan",
            }}
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
