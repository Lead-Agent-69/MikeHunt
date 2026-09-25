"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Panel } from "@/components/shared/Panel";
import { SelectField } from "@/components/shared/Field";
import { DealCard } from "@/components/shared/DealCard";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { Deal } from "@/lib/data/deals-service";
import { US_STATES } from "@/lib/utils/titleRules";
import { Btn } from "@/components/shared/Btn";
import { useDealerId } from "@/hooks/useDealerId";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import dynamic from "next/dynamic";

// Dynamically import the Leaflet map, disabling SSR since it uses window
const DealerMap = dynamic(() => import("@/components/map/DealerMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] md:h-[500px] rounded-[var(--r4)] bg-[var(--s2)] animate-pulse flex items-center justify-center border border-[var(--b1)]">
      <Ico name="map" className="text-[var(--t3)] opacity-50" size={32} />
    </div>
  ),
});

interface ArbitrageDashboard {
  homeState: string;
  topRoutes: Array<{
    targetState: string;
    route: string[];
    distance: number;
    estimatedCost: number;
    estimatedTime: number;
  }>;
  localDeals: Deal[];
  nationalArbitrage: Array<{
    deal: Deal;
    arbitrage: any;
  }>;
}

// Fetcher function for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

export default function ArbitrageDashboardPage() {
  const [homeState, setHomeState] = useState("CA");
  const [activeTab, setActiveTab] = useState<"national" | "local">("national");
  const { dealerId, loading: dealerLoading } = useDealerId();

  // Real geocoded deal points for the network map (so it isn't an empty "No mapped locations" box).
  const { data: mapData } = useSWR("/api/deals/map?verdict=go", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const mapPoints: any[] = mapData?.points ?? [];

  // Use SWR for data fetching with automatic revalidation
  const { data, error, isLoading } = useSWR<ArbitrageDashboard>(
    dealerId && !dealerLoading
      ? `/api/arbitrage?homeState=${homeState}&dealerId=${dealerId}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute
    },
  );

  const loading = isLoading || dealerLoading;
  const authError =
    !dealerLoading && !dealerId
      ? "Please sign in to view arbitrage opportunities."
      : null;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      {/* TOOL DOCK & COMMAND CENTER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 md:p-6 glass-panel mb-6 md:mb-8">
        <div className="w-full md:w-auto">
          <h1 className="text-xl md:text-2xl font-bold text-[var(--t1)] flex items-center gap-2 md:gap-3">
            <Ico name="map" className="text-[var(--green)]" size={24} />{" "}
            National Arbitrage Hub
          </h1>
          <p className="text-xs md:text-sm text-[var(--t4)] mt-1 md:mt-2">
            Discover high-ROI transport routes and local deals instantly.
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
          <SelectField
            options={US_STATES.map((s: string) => ({ value: s, label: s }))}
            value={homeState}
            onChange={(e) => setHomeState(e.target.value)}
            className="flex-1 md:flex-none md:w-32 bg-[var(--s2)] border-[var(--b2)] text-[var(--t1)] min-h-[44px]"
          />
          <Link href="/scan" className="flex-1 md:flex-none">
            <Btn variant="primary" className="w-full min-h-[44px]">
              <Ico name="scan" size={16} />{" "}
              <span className="hidden sm:inline">Live Scanner</span>
              <span className="sm:hidden">Scan</span>
            </Btn>
          </Link>
        </div>
      </div>

      {loading ? (
        <>
          {/* Route cards skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          {/* Deal cards skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      ) : authError || error ? (
        <div className="glass-panel text-center py-12 border border-[rgba(239,68,68,.20)] bg-[rgba(239,68,68,.10)]">
          <p className="text-[var(--red)] font-bold">
            {authError || error?.message || "An error occurred"}
          </p>
        </div>
      ) : data ? (
        <>
          {/* TOP ARBITRAGE ROUTES WIDGET */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            {data.topRoutes.slice(0, 4).map((route, i) => (
              <div
                key={i}
                className="glass-panel p-4 flex flex-col justify-between hover:-translate-y-1 transition-all group animate-popIn min-h-[120px]"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[var(--t4)] uppercase tracking-widest group-hover:text-[var(--green)] transition-colors">
                    Top Route
                  </span>
                  <div
                    className="h-8 w-8 rounded-xl text-[var(--green)] flex items-center justify-center"
                    style={{ background: "var(--glo)" }}
                  >
                    <Ico name="truck" size={14} />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-2xl font-bold text-[var(--t1)] mb-2">
                  {route.route[0]}{" "}
                  <Ico
                    name="arrow"
                    size={16}
                    className="rotate-90 text-[var(--t4)] group-hover:text-[var(--green)] group-hover:translate-x-1 transition-all"
                  />{" "}
                  {route.route[1]}
                </div>
                <div className="text-sm text-[var(--t3)] flex justify-between font-medium">
                  <span>{route.distance} mi</span>
                  <span className="text-[var(--amber)] font-bold">
                    ${route.estimatedCost} est
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* NATIONAL DEALER MAP */}
          <div className="mb-6 md:mb-8 animate-fadeUp">
            <h2 className="text-[11px] font-black text-[var(--t4)] uppercase tracking-widest mb-3 px-1">
              Auction & Dealer Network
            </h2>
            <DealerMap points={mapPoints} />
          </div>

          {/* SMART DEAL GROUPS */}
          <div
            className="flex items-center gap-2 mb-4 md:mb-6 p-1.5 md:p-2 rounded-[var(--r3)] w-full md:w-fit overflow-x-auto"
            style={{ background: "var(--s0)", boxShadow: "var(--shadow2)" }}
          >
            <button
              onClick={() => setActiveTab("national")}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-[var(--r2)] text-xs md:text-sm font-bold uppercase tracking-wider transition-all min-h-[44px] whitespace-nowrap border-none ${
                activeTab === "national"
                  ? "text-white"
                  : "text-[var(--t4)] hover:text-[var(--t1)]"
              }`}
              style={
                activeTab === "national" ? { background: "var(--grad)" } : {}
              }
            >
              <span className="hidden sm:inline">National Arbitrage</span>
              <span className="sm:hidden">National</span> (
              {data.nationalArbitrage.length})
            </button>
            <button
              onClick={() => setActiveTab("local")}
              className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-[var(--r2)] text-xs md:text-sm font-bold uppercase tracking-wider transition-all min-h-[44px] whitespace-nowrap border-none ${
                activeTab === "local"
                  ? "text-white"
                  : "text-[var(--t4)] hover:text-[var(--t1)]"
              }`}
              style={activeTab === "local" ? { background: "var(--grad)" } : {}}
            >
              <span className="hidden sm:inline">Local in {homeState}</span>
              <span className="sm:hidden">{homeState}</span> (
              {data.localDeals.length})
            </button>
          </div>

          {activeTab === "national" && (
            <div className="space-y-6 animate-fadeUp">
              {data.nationalArbitrage.length === 0 ? (
                <div className="glass-panel" style={{ padding: 0 }}>
                  <EmptyState
                    icon="map"
                    title="No arbitrage routes yet"
                    message={`No profitable out-of-state deals to transport into ${homeState} right now. Run a fresh scan to find more.`}
                    action={{ label: "Run the scanner", href: "/scan" }}
                  />
                </div>
              ) : (
                data.nationalArbitrage.map((item, idx) => (
                  <div
                    key={item.deal.id}
                    className="relative pl-6 animate-popIn"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <div className="absolute left-0 top-6 bottom-6 w-1 bg-gradient-to-b from-[var(--green)] to-transparent rounded-full opacity-50" />
                    <div className="mb-2 ml-1 text-xs font-black uppercase tracking-wider text-[var(--green)] flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Ico name="truck" size={14} /> Import from{" "}
                        {item.deal.locationState}
                      </span>
                      <span className="text-[var(--t4)]">•</span>
                      <span>
                        Est. Net Profit:{" "}
                        <Mono className="text-[var(--t1)]">
                          $
                          {item.arbitrage.arbitrage.potentialProfit.toLocaleString()}
                        </Mono>
                      </span>
                      <span className="text-[var(--t4)]">•</span>
                      <span className="text-[var(--amber)] bg-[var(--amber-lo)] px-2 py-0.5 rounded">
                        Transport: $
                        {item.arbitrage.arbitrage.transportCost.toLocaleString()}
                      </span>
                    </div>
                    <DealCard
                      id={item.deal.id}
                      source={item.deal.source}
                      year={item.deal.year ?? 0}
                      make={item.deal.make || ""}
                      model={item.deal.model || ""}
                      askPrice={item.deal.askPrice ?? 0}
                      mmrValue={item.deal.mmrValue ?? 0}
                      profitEstimate={item.deal.profitEstimate ?? 0}
                      profitScore={item.deal.profitScore}
                      locationCity={item.deal.locationCity}
                      locationState={item.deal.locationState}
                      mileage={item.deal.mileage}
                      condition={item.deal.condition}
                      damageType={item.deal.damageType}
                      dealVerdict={item.deal.dealVerdict}
                      recommendedMaxBid={item.deal.recommendedMaxBid}
                      sellEstimate={item.deal.sellEstimate}
                      priceDropAmount={item.deal.priceDropAmount}
                      priceDropDays={item.deal.priceDropDays}
                      firstSeenAt={item.deal.firstSeenAt}
                      onClick={() =>
                        (window.location.href = `/deal/${item.deal.id}`)
                      }
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "local" && (
            <div className="space-y-4 animate-fadeUp">
              {data.localDeals.length === 0 ? (
                <div className="glass-panel" style={{ padding: 0 }}>
                  <EmptyState
                    icon="car"
                    title={`No local deals in ${homeState}`}
                    message="Nothing sourced in this state yet. Try another home state or run the live scanner."
                    action={{ label: "Open scanner", href: "/scan" }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                  {data.localDeals.map((deal, idx) => (
                    <div
                      key={deal.id}
                      className="animate-popIn"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <DealCard
                        id={deal.id}
                        source={deal.source}
                        year={deal.year ?? 0}
                        make={deal.make || ""}
                        model={deal.model || ""}
                        askPrice={deal.askPrice ?? 0}
                        mmrValue={deal.mmrValue ?? 0}
                        profitEstimate={deal.profitEstimate ?? 0}
                        profitScore={deal.profitScore}
                        locationCity={deal.locationCity}
                        locationState={deal.locationState}
                        mileage={deal.mileage}
                        condition={deal.condition}
                        damageType={deal.damageType}
                        dealVerdict={deal.dealVerdict}
                        recommendedMaxBid={deal.recommendedMaxBid}
                        sellEstimate={deal.sellEstimate}
                        priceDropAmount={deal.priceDropAmount}
                        priceDropDays={deal.priceDropDays}
                        firstSeenAt={deal.firstSeenAt}
                        onClick={() =>
                          (window.location.href = `/deal/${deal.id}`)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
