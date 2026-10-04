"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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

  const city = [deal?.locationCity, deal?.locationState].filter(Boolean).join(", ");

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 sm:p-8">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--t4)]">
        One listing to check first
      </p>
      {loading || !deal ? (
        <p className="mt-4 text-sm text-[var(--t3)]">Loading a listing in your scope…</p>
      ) : (
        <div className="mt-4 space-y-3">
          <Link
            href={`/deal/${deal.id}`}
            className="block text-2xl font-black text-[var(--t1)]"
          >
            {deal.title}
          </Link>
          <p className="text-sm font-semibold text-[var(--t2)]">
            Ask ${deal.askPrice.toLocaleString()}
            {city ? ` · ${city}` : ""}
            {deal.source ? ` · ${deal.source.replace(/_/g, " ")}` : ""}
          </p>
          <p className="text-sm text-[var(--t3)]">
            Not a buy until condition and the all-in price are checked.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {capitalOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCapital(opt.value)}
                className={`min-h-12 rounded-xl px-3 text-xs font-bold ${
                  capital === opt.value
                    ? "bg-[var(--t1)] text-[var(--s0)]"
                    : "border border-[var(--b1)] text-[var(--t3)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
