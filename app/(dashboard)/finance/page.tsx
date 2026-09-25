"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/shared/Panel";
import { Field } from "@/components/shared/Field";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";
import { ErrorState } from "@/components/shared/ErrorState";
import { InventoryItem } from "@/lib/data/inventory-service";
import { useDealerId } from "@/hooks/useDealerId";
import { fetcher } from "@/lib/swr-config";

export default function FinancePage() {
  // Calculator state
  const [principal, setPrincipal] = useState("10000");
  const [interestRate, setInterestRate] = useState("1.5");
  const [calcDays, setCalcDays] = useState("30");

  const { dealerId, loading: dealerLoading } = useDealerId();

  const {
    data: invData,
    error: invError,
    isLoading: invLoading,
  } = useSWR(
    dealerId && !dealerLoading
      ? `/api/inventory?dealerId=${dealerId}&limit=100`
      : null,
    fetcher,
  );
  const {
    data: lendersData,
    error: lendersError,
    isLoading: lendersLoading,
  } = useSWR(
    dealerId && !dealerLoading ? "/api/finance/lenders" : null,
    fetcher,
  );

  const inventory = (invData?.items || []) as InventoryItem[];

  const lenders = useMemo(() => {
    if (!lendersData || lendersData.error || !Array.isArray(lendersData))
      return [];
    return lendersData.map((l: any) => ({
      name: l.name,
      rate: l.monthly_rate / 100,
      setup: l.setup_fee,
      advance: l.advance_percentage,
    }));
  }, [lendersData]);

  const loading = dealerLoading || invLoading || lendersLoading;
  const error =
    !dealerLoading && !dealerId
      ? "Please sign in to view your finance data."
      : invError?.message ||
        invData?.error ||
        lendersError?.message ||
        lendersData?.error ||
        null;

  // Fleet summary stats
  const stats = useMemo(() => {
    const totalCost = inventory.reduce((acc, item) => acc + item.totalCost, 0);
    const active = inventory.filter(
      (f) => f.stage !== "sold" && f.stage !== "wholesale",
    );
    const now = Date.now();
    const totalCarry = active.reduce((acc, item) => {
      const days = Math.max(
        0,
        Math.floor((now - new Date(item.floorDate).getTime()) / 86400000),
      );
      return acc + days * (item.dailyFloorRate > 0 ? item.dailyFloorRate : 35);
    }, 0);

    const estProfit = inventory.reduce((acc, f) => {
      const mv = f.marketValue ?? f.listPrice ?? 0;
      return mv > 0 ? acc + mv - f.totalCost : acc;
    }, 0);

    const avgDays =
      active.length > 0
        ? Math.round(
            active.reduce(
              (acc, item) =>
                acc +
                Math.max(
                  0,
                  Math.floor(
                    (now - new Date(item.floorDate).getTime()) / 86400000,
                  ),
                ),
              0,
            ) / active.length,
          )
        : 0;

    return { totalCost, totalCarry, estProfit, avgDays };
  }, [inventory]);

  // Calculator logic
  const p = parseFloat(principal) || 0;
  const r = (parseFloat(interestRate) || 0) / 100;
  const d = parseFloat(calcDays) || 0;

  const dailyCost = (p * r) / 365;
  const monthlyCost = dailyCost * 30;
  const totalCalcCost = dailyCost * d;
  const annualCost = dailyCost * 365;

  // Lender table logic
  const sortedLenders = useMemo(() => {
    return lenders
      .map((l) => {
        const monthlyOn10k = 10000 * l.rate;
        return { ...l, monthlyOn10k };
      })
      .sort((a, b) => a.monthlyOn10k - b.monthlyOn10k);
  }, [lenders]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeUp pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[var(--t1)]">
            Finance & Floorplan
          </h1>
          <p className="text-xs text-[var(--t4)] mt-0.5">
            Compare carrying costs and manage your capital.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <ErrorState
          title="Couldn't load finance data"
          message={error}
          onRetry={() => window.location.reload()}
        />
      )}

      {/* Fleet Cost Summary */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Panel
            padding="sm"
            className="text-center group hover:border-[var(--blue)] transition-colors"
          >
            <p
              className="text-[10px] uppercase font-semibold mb-1"
              style={{ color: "var(--t5)", letterSpacing: "0.07em" }}
            >
              Fleet Value
            </p>
            <Mono className="text-lg font-black text-[var(--t1)] drop-shadow-sm">
              $
              {stats.totalCost.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </Mono>
          </Panel>
          <Panel
            padding="sm"
            className="text-center group hover:border-[var(--red)] transition-colors"
          >
            <p
              className="text-[10px] uppercase font-semibold mb-1"
              style={{ color: "var(--t5)", letterSpacing: "0.07em" }}
            >
              Total Carrying
            </p>
            <Mono className="text-lg font-black text-[var(--red)] drop-shadow-sm">
              $
              {stats.totalCarry.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </Mono>
          </Panel>
          <Panel
            padding="sm"
            className="text-center group hover:border-[var(--green)] transition-colors"
          >
            <p
              className="text-[10px] uppercase font-semibold mb-1"
              style={{ color: "var(--t5)", letterSpacing: "0.07em" }}
            >
              Est. Profit
            </p>
            <Mono className="text-lg font-black text-[var(--green)] drop-shadow-sm">
              {stats.estProfit >= 0 ? "+" : ""}$
              {stats.estProfit.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </Mono>
          </Panel>
          <Panel
            padding="sm"
            className="text-center group hover:border-[var(--amber)] transition-colors"
          >
            <p
              className="text-[10px] uppercase font-semibold mb-1"
              style={{ color: "var(--t5)", letterSpacing: "0.07em" }}
            >
              Avg Days on Lot
            </p>
            <Mono className="text-lg font-black text-[var(--amber)] drop-shadow-sm">
              {stats.avgDays}d
            </Mono>
          </Panel>
        </div>
      )}

      {/* Calculator & Lenders Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Floorplan Calculator */}
        <div className="lg:col-span-1 space-y-4">
          <Panel className="p-5 flex flex-col gap-4 sticky top-4">
            <div className="flex items-center gap-2">
              <Ico name="calculator" size={16} className="text-[var(--blue)]" />
              <h2 className="text-sm font-bold text-[var(--t1)]">
                Floorplan Calculator
              </h2>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--t2)]">
                  Principal Amount ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-[var(--t4)]">
                    $
                  </span>
                  <input
                    type="number"
                    className="field pl-7 w-full text-sm font-mono"
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--t2)]">
                    Rate / Mo (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      className="field pr-7 w-full text-sm font-mono"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono text-[var(--t4)]">
                      %
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--t2)]">
                    Days Held
                  </label>
                  <input
                    type="number"
                    className="field w-full text-sm font-mono"
                    value={calcDays}
                    onChange={(e) => setCalcDays(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--b1)] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--t3)]">Daily Cost</span>
                <Mono className="text-xs font-bold text-[var(--t2)]">
                  ${dailyCost.toFixed(2)}
                </Mono>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--t3)]">Monthly Cost</span>
                <Mono className="text-xs font-bold text-[var(--t2)]">
                  ${monthlyCost.toFixed(2)}
                </Mono>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-bold text-[var(--t1)]">
                  Cost over {d} days
                </span>
                <Mono className="text-sm font-black text-[var(--red)]">
                  $
                  {totalCalcCost.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </Mono>
              </div>
            </div>
          </Panel>
        </div>

        {/* Lender Comparison Table */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-bold text-[var(--t2)] px-1">
            Lender Comparison
          </h2>
          {sortedLenders.length === 0 && !loading && (
            <Panel className="p-6 text-center">
              <p className="text-sm text-[var(--t3)] font-medium">
                No lenders added yet.
              </p>
              <p className="text-xs text-[var(--t4)] mt-1">
                Add your floorplan lenders to compare carrying costs side by
                side.
              </p>
            </Panel>
          )}
          <div className="flex flex-col gap-2">
            {sortedLenders.map((lender, idx) => (
              <Panel
                key={lender.name}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4 transition-all hover:border-[var(--amber-bd)]"
                style={
                  idx === 0
                    ? {
                        border: "1px solid var(--amber-bd)",
                        background: "var(--amber-lo)",
                      }
                    : undefined
                }
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[15px] text-[var(--t1)]">
                      {lender.name}
                    </h3>
                    {idx === 0 && (
                      <span className="text-[10px] font-bold bg-[var(--amber)] text-[var(--s0)] px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Lowest Rate
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--t4)] mt-0.5">
                    Up to {lender.advance}% advance
                  </p>
                </div>

                <div className="flex items-center gap-5 sm:gap-8 w-full sm:w-auto">
                  <div className="flex flex-col text-left sm:text-right">
                    <span className="text-[10px] uppercase font-semibold text-[var(--t5)] tracking-wide">
                      Rate
                    </span>
                    <Mono className="text-sm font-bold text-[var(--blue)]">
                      {(lender.rate * 100).toFixed(1)}%/mo
                    </Mono>
                  </div>
                  <div className="flex flex-col text-left sm:text-right">
                    <span className="text-[10px] uppercase font-semibold text-[var(--t5)] tracking-wide">
                      Setup
                    </span>
                    <Mono className="text-sm font-bold text-[var(--t2)]">
                      ${lender.setup}
                    </Mono>
                  </div>
                  <div className="flex flex-col text-left sm:text-right pr-2">
                    <span className="text-[10px] uppercase font-semibold text-[var(--t5)] tracking-wide">
                      Cost / $10k
                    </span>
                    <Mono className="text-sm font-bold text-[var(--amber)]">
                      ${lender.monthlyOn10k}
                    </Mono>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
