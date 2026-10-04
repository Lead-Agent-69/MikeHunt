"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { buildBuyerIntentQuery, useBuyerIntent } from "@/hooks/useBuyerIntent";
import type { DecisionEvidence } from "@/lib/intelligence/decision-guard";

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
  opportunityMode?: "buy" | "watchlist";
  evidence: DecisionEvidence;
  matchScope?: {
    state?: string;
    source?: string;
    lane?: string;
    sellerType?: string;
    titleType?: string;
    q?: string;
    makes?: string[];
    maxPrice?: number;
    dealerSourceIds?: string[];
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
  const [strategy, setStrategy] = useState<
    "max_roi" | "fastest_flip" | "max_profit"
  >("max_roi");
  const [state, setState] = useState<string>(initialState);
  const [deal, setDeal] = useState<BestBuyDeal | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { intent } = useBuyerIntent();
  const intentQueryString = useMemo(
    () => buildBuyerIntentQuery(intent).toString(),
    [intent],
  );
  const scopedState = useMemo(
    () => new URLSearchParams(intentQueryString).get("state") || "",
    [intentQueryString],
  );

  useEffect(() => {
    if (!initialState && scopedState) setState(scopedState);
  }, [initialState, scopedState]);

  useEffect(() => {
    async function loadBestBuy() {
      setLoading(true);
      try {
        const params = new URLSearchParams(intentQueryString);
        if (capital > 0) params.set("capital", capital.toString());
        if (state) params.set("state", state);
        if (strategy) params.set("strategy", strategy);
        // The server applies the same evidence gate for every intent. Do not take the first
        // profit-sorted Scan row and relabel it as a best buy.
        const res = await fetch(`/api/deals/best-buy?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setDeal(json.bestBuy || null);
        }
      } catch (err) {
        console.error("Failed to fetch best buy deal:", err);
      } finally {
        setLoading(false);
      }
    }

    loadBestBuy();
  }, [capital, state, strategy, intentQueryString]);

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

  const isWatchCandidate = deal?.opportunityMode === "watchlist";
  const isVerifiedBuy = deal?.evidence.acquisitionReady === true;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--b2)] bg-[var(--s0)]/80 backdrop-blur-2xl p-6 sm:p-8"
      style={{
        boxShadow:
          "0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Top Header & Filter Controls */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[var(--b1)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-green-500/20 text-black">
            <Flame className="h-5 w-5 fill-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-black uppercase tracking-[0.25em] ${isVerifiedBuy ? "text-emerald-400" : "text-amber-300"}`}
              >
                {isWatchCandidate ? "Best Research Candidate" : "Next Best Buy"}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${isVerifiedBuy ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isVerifiedBuy ? "bg-emerald-400 animate-ping" : "bg-amber-300"}`}
                />
                {isWatchCandidate ? "Research first" : "Evidence checked"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--t1)] tracking-tight">
              {isWatchCandidate
                ? "Verify This Listing Before You Buy"
                : "Highest Margin Flip Opportunity"}
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
            Ranking scoped inventory by proof, margin, and buyer fit...
          </p>
        </div>
      ) : deal ? (
        <div className="relative z-10 pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Vehicle Hero & Metrics */}
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-lg px-3 py-1 text-xs font-black uppercase border ${isVerifiedBuy ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20"}`}
                >
                  {isVerifiedBuy
                    ? `${deal.roiPct}% Projected ROI`
                    : deal.evidence.label}
                </span>
                <span className="rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t3)] border border-[var(--b1)]">
                  Score {deal.profitScore}/130
                </span>
                {deal.locationState && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t3)] border border-[var(--b1)]">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {deal.locationCity ? `${deal.locationCity}, ` : ""}
                    {deal.locationState}
                  </span>
                )}
                {deal.source && (
                  <span className="rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t4)] border border-[var(--b1)] capitalize">
                    {deal.source.replace(/_/g, " ")}
                  </span>
                )}
                {deal.matchScope?.makes?.length ? (
                  <span className="rounded-lg bg-[var(--s1)] px-3 py-1 text-xs font-bold text-[var(--t4)] border border-[var(--b1)]">
                    {deal.matchScope.makes.join("/")} focus
                  </span>
                ) : null}
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
                    {deal.mileage.toLocaleString()} miles
                    {isVerifiedBuy && deal.daysToTurn > 0
                      ? ` · ${deal.daysToTurn} days estimated turn`
                      : ""}
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
                    {isVerifiedBuy ? "Resale estimate" : "Market reference"}
                  </div>
                  {isVerifiedBuy ? (
                    <Mono className="text-lg sm:text-xl font-bold text-[var(--t1)] mt-0.5">
                      ${deal.sellEstimate.toLocaleString()}
                    </Mono>
                  ) : (
                    <div className="mt-1 text-sm font-bold text-[var(--t3)]">
                      Verify condition first
                    </div>
                  )}
                </div>

                <div
                  className={`glass-panel p-3.5 rounded-2xl border ${isVerifiedBuy ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider ${isVerifiedBuy ? "text-emerald-400" : "text-amber-300"}`}
                  >
                    {isVerifiedBuy ? "Projected Net" : "Decision status"}
                  </div>
                  {isVerifiedBuy ? (
                    <Mono className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">
                      {deal.trueNetProfit >= 0 ? "+" : "-"}$
                      {Math.abs(deal.trueNetProfit).toLocaleString()}
                    </Mono>
                  ) : (
                    <div className="mt-1 text-sm font-bold text-amber-100">
                      Research required
                    </div>
                  )}
                </div>

                <div className="glass-panel p-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    {isVerifiedBuy ? "Target offer" : "Next requirement"}
                  </div>
                  {isVerifiedBuy ? (
                    <Mono className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">
                      ${deal.targetOffer.toLocaleString()}
                    </Mono>
                  ) : (
                    <div className="mt-1 text-sm font-bold text-amber-100">
                      Verify all-in cost
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <Link
                  href={`/deal/${deal.id}`}
                  className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black text-black bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 shadow-xl shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Sparkles className="h-4 w-4 fill-black" />
                  {isWatchCandidate
                    ? "Inspect Watch Candidate"
                    : "Review Next Best Buy"}
                  <ChevronRight className="h-4 w-4" />
                </Link>

                {isVerifiedBuy ? (
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
                ) : null}

                <Link
                  href={`/deal/${deal.id}#negotiator`}
                  className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-[var(--t2)] bg-[var(--s1)] border border-[var(--b2)] hover:border-[var(--b3)] hover:text-[var(--t1)] transition-all"
                >
                  <Target className="h-4 w-4 text-amber-400" />
                  {isVerifiedBuy ? "Open Offer Draft" : "See What To Check"}
                </Link>
              </div>
            </div>

            {/* Right: Decision Breakdown */}
            <div className="lg:col-span-5">
              <div
                className={`glass-panel p-6 rounded-3xl border bg-[var(--s1)]/80 space-y-4 ${isVerifiedBuy ? "border-emerald-500/20" : "border-amber-500/20"}`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest ${isVerifiedBuy ? "text-emerald-400" : "text-amber-300"}`}
                  >
                    {isVerifiedBuy ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {isWatchCandidate
                      ? "What still needs checking"
                      : "Decision thesis"}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--t4)]">
                    {isVerifiedBuy ? "Evidence-backed" : "Not purchase-ready"}
                  </div>
                </div>

                <div className="space-y-3 text-xs leading-relaxed text-[var(--t3)]">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[var(--t1)]">
                        {isVerifiedBuy
                          ? "Why this verdict:"
                          : "Why it is on watch:"}{" "}
                      </strong>
                      {deal.aiRationale.spreadAnalysis}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Clock className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[var(--t1)]">
                        {isVerifiedBuy
                          ? "Market context:"
                          : "What would make this a buy:"}{" "}
                      </strong>
                      {deal.aiRationale.turnSpeed}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[var(--t1)]">
                        {isVerifiedBuy
                          ? "Transaction risk:"
                          : "What still needs checking:"}{" "}
                      </strong>
                      {deal.aiRationale.riskBuffer}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-black/40 border border-white/5 p-3.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)] mb-1">
                    {isVerifiedBuy ? "Next action" : "Do this next"}
                  </div>
                  <p
                    className={`text-xs font-semibold ${isVerifiedBuy ? "text-emerald-300" : "text-amber-100"}`}
                  >
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
