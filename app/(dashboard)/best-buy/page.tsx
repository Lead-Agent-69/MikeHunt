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
  const [strategy, setStrategy] = useState<"max_roi" | "fastest_flip" | "max_profit">("max_roi");
  const [state, setState] = useState<string>("");
  const [data, setData] = useState<BestBuyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
            Next Best Buy Sniper
          </h1>
          <p className="text-[var(--t3)] text-sm sm:text-base mt-1 max-w-2xl">
            Algorithms scan thousands of live dealer auctions and private listings to surface the single highest-margin flip tailored to your available cash on hand.
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
              <span className="text-xs font-medium text-[var(--t4)]">cash budget</span>
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
                Runner-Up High-Margin Alternatives
              </h2>
              <p className="text-xs sm:text-sm text-[var(--t3)] mt-0.5">
                Top alternative candidates segmented across capital tiers
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              {data.stats.totalConsidered} Active GO Deals Analyzed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {data.runnerUps.map((item, idx) => (
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
                    <span className="text-xs font-black text-emerald-400">
                      +{item.roiPct}% ROI
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-black text-[var(--t1)] leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[var(--t4)] mt-0.5">
                      {item.locationState ? `${item.locationState} · ` : ""}
                      {item.daysToTurn}d turn speed
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
                        Net Profit
                      </div>
                      <Mono className="text-sm font-black text-emerald-400">
                        +${item.trueNetProfit.toLocaleString()}
                      </Mono>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-[var(--b1)] flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--t3)]">
                    Offer: <Mono className="text-[var(--t1)]">${item.targetOffer.toLocaleString()}</Mono>
                  </span>
                  <Link
                    href={`/deal/${item.id}`}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300"
                  >
                    View Deal
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Flip Compound ROI Calculator */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-[var(--b2)] bg-gradient-to-br from-[var(--s1)] via-[var(--s0)] to-black/60">
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400">
            <BarChart3 className="h-4 w-4" />
            Capital Velocity Compound Model
          </div>
          <h2 className="text-2xl font-black text-[var(--t1)]">
            How Much Can You Grow ${capital.toLocaleString()} in 90 Days?
          </h2>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            By reinvesting capital every 18 days into MikeHunt Next Best Buy recommendations (averaging {data?.stats.avgRoi ?? 32}% ROI per flip), you can turn {capital.toLocaleString()} into an estimated{" "}
            <strong className="text-emerald-400">
              ${Math.round(capital * Math.pow(1 + (data?.stats.avgRoi ?? 32) / 100, 3)).toLocaleString()}
            </strong>{" "}
            across 3 flips.
          </p>
        </div>
      </div>
    </div>
  );
}
