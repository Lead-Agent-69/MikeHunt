"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";

interface BestBuyDeal {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  title: string;
  vin?: string;
  mileage?: number;
  askPrice: number;
  sellEstimate: number;
  trueNetProfit: number;
  roiPct: number;
  profitScore: number;
  dealVerdict: string;
  recommendedMaxBid: number;
  targetOffer: number;
  locationCity?: string;
  locationState?: string;
  images: string[];
  source?: string;
  sourceUrl?: string;
  sellerPhone?: string;
  liquidityScore: number;
  daysToTurn: number;
  downsideBuffer: number;
  discountToComps: number;
  aiRationale: {
    headline: string;
    spreadAnalysis: string;
    turnSpeed: string;
    riskBuffer: string;
    recommendedAction: string;
  };
}

export function NextBestBuySpotlight({
  initialState = "",
  compact = false,
}: {
  initialState?: string;
  compact?: boolean;
}) {
  const [capital, setCapital] = useState<number>(0);
  const [strategy, setStrategy] = useState<"max_roi" | "fastest_flip" | "max_profit">("max_roi");
  const [state, setState] = useState<string>(initialState);
  const [deal, setDeal] = useState<BestBuyDeal | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadBestBuy() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (capital > 0) params.set("capital", capital.toString());
        if (state) params.set("state", state);
        if (strategy) params.set("strategy", strategy);

        const res = await fetch(`/api/deals/best-buy?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setDeal(json.bestBuy);
        }
      } catch (err) {
        console.error("Failed to fetch best buy deal:", err);
      } finally {
        setLoading(false);
      }
    }

    loadBestBuy();
  }, [capital, state, strategy]);

  const capitalOptions = [
    { label: "Any Budget", value: 0 },
    { label: "< $6,000", value: 6000 },
    { label: "< $12,000", value: 12000 },
    { label: "< $20,000", value: 20000 },
    { label: "< $35,000", value: 35000 },
  ];

  if (!loading && !deal) {
    return null;
  }

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--b2)] bg-[var(--s0)]/80 backdrop-blur-2xl p-6 sm:p-8"
      style={{
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Background neon atmospheric ambient lights */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-20 blur-[80px]"
        style={{ background: "var(--green)" }}
      />
      <div
        className="pointer-events-none absolute -left-20 -bottom-20 h-72 w-72 rounded-full opacity-20 blur-[80px]"
        style={{ background: "var(--amber)" }}
      />

      {/* Top Header & Filter Controls */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[var(--b1)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-green-500/20 text-black">
            <Flame className="h-5 w-5 fill-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-400">
                AI Next Best Buy Sniper
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Rank #1
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--t1)] tracking-tight">
              Highest Margin Flip Opportunity
            </h2>
          </div>
        </div>

        {/* Capital & Strategy Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {capitalOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCapital(opt.value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                capital === opt.value
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 scale-105"
                  : "bg-[var(--s1)] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] border border-[var(--b1)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="mt-3 text-xs font-semibold text-[var(--t4)] uppercase tracking-widest">
            Scanning 100+ sources for highest ROI spread...
          </p>
        </div>
      ) : deal ? (
        <div className="relative z-10 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Vehicle Hero & Metrics */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase text-emerald-400 border border-emerald-500/20">
                  {deal.roiPct}% Projected ROI
                </span>
                <span className="rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t3)] border border-[var(--b1)]">
                  Score {deal.profitScore}/130
                </span>
                {deal.locationState && (
                  <span className="rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t3)] border border-[var(--b1)]">
                    📍 {deal.locationCity ? `${deal.locationCity}, ` : ""}{deal.locationState}
                  </span>
                )}
                {deal.source && (
                  <span className="rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t4)] border border-[var(--b1)] capitalize">
                    {deal.source.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              <div>
                <Link
                  href={`/deal/${deal.id}`}
                  className="group inline-block text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--t1)] hover:text-emerald-400 transition-colors"
                >
                  {deal.title}
                  <ArrowUpRight className="inline-block ml-1 h-6 w-6 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all text-emerald-400" />
                </Link>
                {deal.mileage ? (
                  <p className="text-sm font-semibold text-[var(--t3)] mt-1">
                    {deal.mileage.toLocaleString()} miles · {deal.daysToTurn} days avg turn speed
                  </p>
                ) : null}
              </div>

              {/* Financial Dashboard Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="glass-panel p-3.5 rounded-2xl border border-[var(--b1)]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
                    Asking Price
                  </div>
                  <Mono className="text-lg sm:text-xl font-bold text-[var(--t2)] mt-0.5">
                    ${deal.askPrice.toLocaleString()}
                  </Mono>
                </div>

                <div className="glass-panel p-3.5 rounded-2xl border border-[var(--b1)]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
                    Market Comps
                  </div>
                  <Mono className="text-lg sm:text-xl font-bold text-[var(--t1)] mt-0.5">
                    ${deal.sellEstimate.toLocaleString()}
                  </Mono>
                </div>

                <div className="glass-panel p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Net Profit
                  </div>
                  <Mono className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">
                    +${deal.trueNetProfit.toLocaleString()}
                  </Mono>
                </div>

                <div className="glass-panel p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Target Offer
                  </div>
                  <Mono className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">
                    ${deal.targetOffer.toLocaleString()}
                  </Mono>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <Link
                  href={`/deal/${deal.id}`}
                  className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black text-black bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 shadow-xl shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Sparkles className="h-4 w-4 fill-black" />
                  Claim Next Best Buy
                  <ChevronRight className="h-4 w-4" />
                </Link>

                <AcquireToPipelineButton
                  deal={{
                    id: deal.id,
                    vin: deal.vin,
                    year: deal.year,
                    make: deal.make,
                    model: deal.model,
                    trim: deal.trim,
                    askPrice: deal.askPrice,
                    trueNetProfit: deal.trueNetProfit,
                    sellEstimate: deal.sellEstimate,
                    locationCity: deal.locationCity,
                    locationState: deal.locationState,
                  }}
                />

                <Link
                  href={`/deal/${deal.id}#negotiator`}
                  className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-[var(--t2)] bg-[var(--s1)] border border-[var(--b2)] hover:border-[var(--b3)] hover:text-[var(--t1)] transition-all"
                >
                  <Target className="h-4 w-4 text-amber-400" />
                  Run AI Negotiator
                </Link>
              </div>
            </div>

            {/* Right: AI Intelligence Breakdown */}
            <div className="lg:col-span-5">
              <div className="glass-panel p-6 rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 via-[var(--s1)]/80 to-[var(--s0)] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    AI Investment Thesis
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--t4)]">
                    Confidence 94%
                  </div>
                </div>

                <div className="space-y-3 text-xs leading-relaxed text-[var(--t3)]">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[var(--t1)]">Instant Equity Spread: </strong>
                      {deal.aiRationale.spreadAnalysis}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Clock className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[var(--t1)]">Liquidity Velocity: </strong>
                      {deal.aiRationale.turnSpeed}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[var(--t1)]">Downside Cushion: </strong>
                      {deal.aiRationale.riskBuffer}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/40 border border-white/5 p-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)] mb-1">
                    Negotiation Playbook
                  </div>
                  <p className="text-xs font-semibold text-emerald-300">
                    {deal.aiRationale.recommendedAction}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
