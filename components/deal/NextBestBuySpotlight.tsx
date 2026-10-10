"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { buildBuyerIntentQuery, useBuyerIntent } from "@/hooks/useBuyerIntent";
import type { DecisionEvidence } from "@/lib/intelligence/decision-guard";
import { sourceLabel } from "@/lib/sources/source-meta";
import { RotateCcw } from "lucide-react";

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
  const strategy = "max_roi";
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    url: string;
    deal: BestBuyDeal | null;
    failed: boolean;
  } | null>(null);
  const { intent } = useBuyerIntent();
  const intentQueryString = useMemo(
    () => buildBuyerIntentQuery(intent).toString(),
    [intent],
  );
  const scopedState = useMemo(
    () => new URLSearchParams(intentQueryString).get("state") || "",
    [intentQueryString],
  );

  const state = initialState || scopedState;
  const requestUrl = useMemo(() => {
    const params = new URLSearchParams(intentQueryString);
    if (capital > 0) params.set("capital", capital.toString());
    if (state) params.set("state", state);
    params.set("strategy", strategy);
    return `/api/deals/best-buy?${params.toString()}`;
  }, [capital, state, strategy, intentQueryString]);
  const currentResult = result?.url === requestUrl ? result : null;
  const loading = !currentResult;
  const deal = currentResult?.deal ?? null;
  const failed = currentResult?.failed ?? false;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult(null);
    async function loadBestBuy() {
      try {
        // The server applies the same evidence gate for every intent. Do not take the first
        // profit-sorted Scan row and relabel it as a best buy.
        const res = await fetch(requestUrl, { signal: controller.signal });
        if (!res.ok) throw new Error("Recommendation unavailable");
        const json = await res.json();
        if (active)
          setResult({
            url: requestUrl,
            deal: json.bestBuy || null,
            failed: false,
          });
      } catch {
        if (active) setResult({ url: requestUrl, deal: null, failed: true });
      }
    }

    void loadBestBuy();
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestUrl, attempt]);

  const capitalOptions = [
    { label: "Any Budget", value: 0 },
    { label: "< $6,000", value: 6000 },
    { label: "< $12,000", value: 12000 },
    { label: "< $20,000", value: 20000 },
    { label: "< $35,000", value: 35000 },
  ];

  if (!loading && !deal && !failed) {
    return null;
  }

  const city = [deal?.locationCity, deal?.locationState]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-4 sm:p-6"
      aria-busy={loading}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--t4)]">
        One listing to check first
      </p>
      {failed ? (
        <div className="mt-3 text-sm text-[var(--t2)]">
          <p role="status">
            We couldn't check a listing for this search. Your other results are
            still available.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--blue)]"
          >
            <RotateCcw size={16} aria-hidden="true" /> Try again
          </button>
        </div>
      ) : loading || !deal ? (
        <p role="status" className="mt-4 text-sm text-[var(--t3)]">
          Loading a listing in your scope…
        </p>
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
            {deal.source ? ` · ${sourceLabel(deal.source)}` : ""}
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
