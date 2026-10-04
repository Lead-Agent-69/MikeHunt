"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Zap,
  Target,
  ShieldCheck,
  Clock,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
  DollarSign,
  Flame,
  CheckCircle2,
  Sliders,
  Filter,
  BarChart3,
  Layers,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import { NextBestBuySpotlight } from "@/components/deal/NextBestBuySpotlight";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { CashOfferLetterModal } from "@/components/deal/CashOfferLetterModal";
import {
  PremiumCarousel,
  type PremiumCarouselItem,
} from "@/components/ui/premium-carousel";

interface BestBuyData {
  bestBuy: any;
  runnerUps: any[];
  stats: {
    totalConsidered: number;
    avgRoi: number;
    maxProfit: number;
    strategyUsed: string;
  };
}

export default function BestBuyPage() {
  const [capital, setCapital] = useState<number>(15000);
  const [strategy, setStrategy] = useState<
    "max_roi" | "fastest_flip" | "max_profit"
  >("max_roi");
  const [state, setState] = useState<string>("");
  const [data, setData] = useState<BestBuyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLoiDeal, setSelectedLoiDeal] = useState<any | null>(null);

  useEffect(() => {
    async function fetchRunnerUps() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (capital > 0) params.set("capital", capital.toString());
        if (state) params.set("state", state);
        if (strategy) params.set("strategy", strategy);

        const res = await fetch(`/api/deals/best-buy?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to load best buys:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchRunnerUps();
  }, [capital, strategy, state]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Premium Carousel — Top picks showcase */}
      {data && (data.bestBuy || data.runnerUps?.length > 0) && (
        <div className="glass-panel p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--t1)]">Top Picks</h2>
            <span className="text-xs text-[var(--t4)]">Swipe to explore</span>
          </div>
          <PremiumCarousel
            items={[
              ...(data.bestBuy ? [data.bestBuy] : []),
              ...(data.runnerUps || []),
            ]
              .slice(0, 5)
              .map((deal: any) => ({
                id: deal.id,
                image:
                  deal.image_url || deal.image || "/images/car-placeholder.jpg",
                title: `${deal.year} ${deal.make} ${deal.model}`.trim(),
                subtitle: deal.location_state
                  ? `${deal.location_state} · ${deal.mileage?.toLocaleString() || ""} miles`
                  : undefined,
                category: deal.evidence?.acquisitionReady
                  ? "Evidence-backed"
                  : deal.evidence?.label || "Needs verification",
                description:
                  deal.evidence?.acquisitionReady && deal.trueNetProfit
                    ? `Net profit: $${deal.trueNetProfit.toLocaleString()}`
                    : deal.evidence?.summary,
                price: deal.askPrice
                  ? `$${deal.askPrice.toLocaleString()}`
                  : undefined,
                year: deal.year,
                mileage: deal.mileage
                  ? `${deal.mileage.toLocaleString()} mi`
                  : undefined,
                cta: "View Deal",
              }))}
            autoPlay={true}
            autoPlaySpeed={4000}
          />
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Automated Opportunity Engine
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[var(--t1)] tracking-tight">
            Next Best Buy
          </h1>
          <p className="text-[var(--t3)] text-sm sm:text-base mt-1 max-w-2xl">
            Rank live dealer auctions and private listings by proof, margin,
            velocity, and your available capital.
          </p>
        </div>

        {/* Global Strategy Selector */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--s1)] border border-[var(--b2)] shrink-0">
          <button
            onClick={() => setStrategy("max_roi")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              strategy === "max_roi"
                ? "bg-emerald-500 text-black shadow-md font-black"
                : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            Max ROI %
          </button>
          <button
            onClick={() => setStrategy("fastest_flip")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              strategy === "fastest_flip"
                ? "bg-cyan-500 text-black shadow-md font-black"
                : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            Fast Turn (&lt;14d)
          </button>
          <button
            onClick={() => setStrategy("max_profit")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              strategy === "max_profit"
                ? "bg-amber-500 text-black shadow-md font-black"
                : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            Max Cash ($)
          </button>
        </div>
      </div>

      {/* Interactive Capital Budget Slider */}
      <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-[var(--b2)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--t4)]">
              Your Available Capital
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <Mono className="text-3xl font-black text-[var(--t1)]">
                ${capital.toLocaleString()}
              </Mono>
              <span className="text-xs font-medium text-[var(--t4)]">
                cash budget
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[5000, 10000, 15000, 25000, 40000].map((c) => (
              <button
                key={c}
                onClick={() => setCapital(c)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  capital === c
                    ? "bg-[var(--t1)] text-[var(--s0)]"
                    : "bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)]"
                }`}
              >
                ${(c / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
        </div>

        <input
          type="range"
          min={3000}
          max={60000}
          step={1000}
          value={capital}
          onChange={(e) => setCapital(Number(e.target.value))}
          className="w-full h-2 bg-[var(--s2)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />

        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--t4)]">
          <span>$3,000 (Starter Flip)</span>
          <span>$25,000 (Mid-Market)</span>
          <span>$60,000+ (High Yield)</span>
        </div>
      </div>

      {/* Hero Spotlight: #1 Best Buy */}
      <NextBestBuySpotlight initialState={state} />

      {/* Tiered Runner-Up Opportunities */}
      {data?.runnerUps && data.runnerUps.length > 0 && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--t1)]">
                Alternative Candidates
              </h2>
              <p className="text-xs sm:text-sm text-[var(--t3)] mt-0.5">
                Candidates ranked by buyer fit; research items cannot be
                acquired from this view.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              {data.stats.totalConsidered} candidates reviewed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {data.runnerUps.map((item, idx) => {
              const isReady = item.evidence?.acquisitionReady === true;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="glass-panel p-5 rounded-3xl border border-[var(--b2)] hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/5 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded-lg bg-[var(--s2)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--t3)]">
                        Tier #{idx + 2} Candidate
                      </span>
                      <span
                        className={`text-xs font-black ${isReady ? "text-emerald-400" : "text-amber-300"}`}
                      >
                        {isReady
                          ? `+${item.roiPct}% ROI`
                          : item.evidence?.label || "Needs verification"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-black text-[var(--t1)] leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--t4)] mt-0.5">
                        {item.locationState ? `${item.locationState} · ` : ""}
                        {isReady && item.daysToTurn
                          ? `${item.daysToTurn}d estimated turn`
                          : "Research before purchase"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--b1)]">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-[var(--t4)]">
                          Asking
                        </div>
                        <Mono className="text-sm font-bold text-[var(--t2)]">
                          ${item.askPrice.toLocaleString()}
                        </Mono>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-emerald-400">
                          {isReady ? "Projected net" : "Decision status"}
                        </div>
                        {isReady ? (
                          <Mono className="text-sm font-black text-emerald-400">
                            +${item.trueNetProfit.toLocaleString()}
                          </Mono>
                        ) : (
                          <span className="text-sm font-black text-amber-200">
                            Research required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-[var(--b1)] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--t4)] font-bold">
                        {isReady ? (
                          <>
                            Target offer:{" "}
                            <Mono className="text-amber-400 font-black">
                              ${item.targetOffer?.toLocaleString() ?? "—"}
                            </Mono>
                          </>
                        ) : (
                          item.evidence?.nextCheck
                        )}
                      </span>
                      {isReady ? (
                        <button
                          onClick={() => setSelectedLoiDeal(item)}
                          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline"
                        >
                          Cash Offer LOI
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {isReady ? (
                        <AcquireToPipelineButton
                          deal={{
                            id: item.id,
                            vin: item.vin,
                            year: item.year,
                            make: item.make,
                            model: item.model,
                            trim: item.trim,
                            askPrice: item.askPrice,
                            trueNetProfit: item.trueNetProfit,
                            sellEstimate: item.sellEstimate,
                            locationCity: item.locationCity,
                            locationState: item.locationState,
                          }}
                          className="w-full py-2 text-xs"
                        />
                      ) : null}

                      <Link
                        href={`/deal/${item.id}`}
                        className="p-2 rounded-2xl bg-[var(--s2)] border border-[var(--b2)] text-[var(--t2)] hover:text-white hover:border-emerald-500/40 transition-colors shrink-0"
                        title="View Full Deal Dossier"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* A projection is only useful after the lead clears the evidence gate. */}
      {data?.bestBuy?.evidence?.acquisitionReady === true ? (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 via-[var(--s1)] to-black/80 shadow-2xl space-y-6">
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400">
              <BarChart3 className="h-4 w-4" />
              Capital Velocity Compound Model
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-[var(--t1)] tracking-tight">
              How Much Can You Grow ${capital.toLocaleString()} in 90 Days?
            </h2>
            <p className="text-xs sm:text-sm text-[var(--t3)] leading-relaxed">
              By rolling your initial bankroll and profits every 18 days into
              MikeHunt Next Best Buy opportunities (averaging{" "}
              {data?.stats.avgRoi ?? 32}% ROI per flip), here is your projected
              compounding trajectory:
            </p>
          </div>

          {/* 3-Stage Visual Pipeline */}
          {(() => {
            const roi = (data?.stats.avgRoi ?? 32) / 100;
            const flip1 = Math.round(capital * (1 + roi));
            const flip2 = Math.round(flip1 * (1 + roi));
            const flip3 = Math.round(flip2 * (1 + roi));
            const netGain = flip3 - capital;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-[var(--s0)] border border-[var(--b2)]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t4)] block">
                    Starting Bankroll
                  </span>
                  <Mono className="text-xl font-black text-[var(--t1)] mt-1 block">
                    ${capital.toLocaleString()}
                  </Mono>
                  <span className="text-[10px] text-[var(--t5)] mt-0.5 block">
                    Day 0 Deployment
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--s0)] border border-[var(--b2)]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 block">
                    After Flip #1 (Day 18)
                  </span>
                  <Mono className="text-xl font-black text-cyan-400 mt-1 block">
                    ${flip1.toLocaleString()}
                  </Mono>
                  <span className="text-[10px] text-[var(--t4)] mt-0.5 block">
                    +${(flip1 - capital).toLocaleString()} net profit
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--s0)] border border-[var(--b2)]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                    After Flip #2 (Day 42)
                  </span>
                  <Mono className="text-xl font-black text-amber-400 mt-1 block">
                    ${flip2.toLocaleString()}
                  </Mono>
                  <span className="text-[10px] text-[var(--t4)] mt-0.5 block">
                    +${(flip2 - flip1).toLocaleString()} net profit
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                    Final Portfolio (Day 90)
                  </span>
                  <Mono className="text-2xl font-black text-emerald-400 mt-1 block">
                    ${flip3.toLocaleString()}
                  </Mono>
                  <span className="text-[10px] font-bold text-emerald-400/90 mt-0.5 block">
                    +${netGain.toLocaleString()} Total Gain (
                    {Math.round((netGain / capital) * 100)}%)
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {selectedLoiDeal && (
        <CashOfferLetterModal
          isOpen={!!selectedLoiDeal}
          onClose={() => setSelectedLoiDeal(null)}
          deal={{
            id: selectedLoiDeal.id,
            vin: selectedLoiDeal.vin,
            year: selectedLoiDeal.year,
            make: selectedLoiDeal.make,
            model: selectedLoiDeal.model,
            trim: selectedLoiDeal.trim,
            askPrice: selectedLoiDeal.askPrice,
            targetOffer: selectedLoiDeal.targetOffer,
            recommendedMaxBid: selectedLoiDeal.recommendedMaxBid,
            locationCity: selectedLoiDeal.locationCity,
            locationState: selectedLoiDeal.locationState,
          }}
        />
      )}
    </div>
  );
}
