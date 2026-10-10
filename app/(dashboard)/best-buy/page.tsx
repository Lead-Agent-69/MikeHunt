"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { z } from "zod";
import { ChevronRight, RotateCcw } from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { CashOfferLetterModal } from "@/components/deal/CashOfferLetterModal";

const rankedCandidate = z
  .object({
    id: z.string().min(1),
    title: z.string().nullable().optional(),
    askPrice: z.number().finite().nullable().optional(),
    trueNetProfit: z.number().finite().nullable().optional(),
    images: z.array(z.string()).optional(),
    evidence: z
      .object({
        acquisitionReady: z.boolean().optional(),
        nextCheck: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();
const rankedResponse = z
  .object({
    bestBuy: rankedCandidate.nullable(),
    runnerUps: z.array(rankedCandidate),
    stats: z
      .object({ totalConsidered: z.number().finite().nonnegative() })
      .passthrough(),
  })
  .passthrough();

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
  const [capital, setCapital] = useState<number>(0);
  const [strategy, setStrategy] = useState<
    "max_roi" | "fastest_flip" | "max_profit"
  >("max_roi");
  const [state] = useState<string>("");
  const [data, setData] = useState<BestBuyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedLoiDeal, setSelectedLoiDeal] = useState<any | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    async function fetchRunnerUps() {
      setLoading(true);
      setData(null);
      setError(false);
      setSelectedLoiDeal(null);
      try {
        const params = new URLSearchParams();
        if (capital > 0) params.set("capital", capital.toString());
        if (state) params.set("state", state);
        if (strategy) params.set("strategy", strategy);

        const res = await fetch(`/api/deals/best-buy?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Ranked picks unavailable");
        const json = await res.json();
        if (!rankedResponse.safeParse(json).success)
          throw new Error("Invalid ranked picks response");
        if (current) setData(json);
      } catch {
        if (current) setError(true);
      } finally {
        if (current) setLoading(false);
      }
    }

    fetchRunnerUps();
    return () => {
      current = false;
      controller.abort();
    };
  }, [capital, strategy, state, attempt]);

  const candidates = data
    ? [...(data.bestBuy ? [data.bestBuy] : []), ...data.runnerUps].filter(
        (item, index, items) =>
          items.findIndex((other) => other.id === item.id) === index,
      )
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              One listing to check first
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[var(--t1)] tracking-tight">
            Ranked picks
          </h1>
          <p className="text-[var(--t3)] text-sm sm:text-base mt-1 max-w-2xl">
            Ask, city, and source only. Not a buy until condition and the all-in
            price are checked.
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
          <div className="flex flex-wrap items-center gap-2">
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
          aria-label="Available capital"
          min={0}
          max={60000}
          step={1000}
          value={capital}
          onChange={(e) => setCapital(Number(e.target.value))}
          className="w-full h-2 bg-[var(--s2)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />

        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--t4)]">
          <span>$0 (No budget limit)</span>
          <span>$25,000 (Mid-Market)</span>
          <span>$60,000+ (High Yield)</span>
        </div>
      </div>

      {loading && (
        <p role="status" className="text-sm text-[var(--t3)]">
          Loading ranked picks...
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-3 border-y border-[var(--b1)] py-4"
        >
          <p>Couldn't load ranked picks. No recommendations are available.</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--blue)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
      {!loading && !error && data && candidates.length === 0 && (
        <p role="status">No candidates match this budget and strategy.</p>
      )}

      {/* Tiered Runner-Up Opportunities */}
      {!loading && !error && data && candidates.length > 0 && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--t1)]">
                Buying candidates
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
            {candidates.map((item, idx) => {
              const isReady = item.evidence?.acquisitionReady === true;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-5 rounded-lg border border-[var(--b2)] flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <Image
                      src={item.images?.[0] || "/images/car-placeholder.jpg"}
                      alt={item.title || "Vehicle photo"}
                      width={640}
                      height={400}
                      unoptimized
                      className="aspect-[8/5] w-full rounded-lg object-cover"
                      onError={(event) => {
                        event.currentTarget.src = "/images/car-placeholder.jpg";
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <span className="rounded-lg bg-[var(--s2)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--t3)]">
                        Candidate #{idx + 1}
                      </span>
                      <span
                        className={`text-xs font-black ${isReady ? "text-emerald-400" : "text-amber-300"}`}
                      >
                        {item.source
                          ? String(item.source).replace(/_/g, " ")
                          : "Source on file"}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-black text-[var(--t1)] leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--t4)] mt-0.5">
                        {item.locationState ? `${item.locationState} · ` : ""}
                        Not a buy until condition and the all-in price are
                        checked.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--b1)]">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-[var(--t4)]">
                          Asking
                        </div>
                        <Mono className="text-sm font-bold text-[var(--t2)]">
                          {typeof item.askPrice === "number" &&
                          item.askPrice > 0
                            ? `$${item.askPrice.toLocaleString()}`
                            : "Price not reported"}
                        </Mono>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-emerald-400">
                          {isReady ? "Projected net" : "Decision status"}
                        </div>
                        {isReady ? (
                          <Mono className="text-sm font-black text-emerald-400">
                            {typeof item.trueNetProfit === "number"
                              ? `$${item.trueNetProfit.toLocaleString()}`
                              : "Not available"}
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
                            condition:
                              item.titleType ||
                              item.title_type ||
                              item.condition ||
                              "unknown",
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
