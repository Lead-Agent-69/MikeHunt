"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  Clock,
  TrendingDown,
  AlertCircle,
  HelpCircle,
  Percent,
  Calendar,
  DollarSign,
  ShieldAlert,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

interface FloorPlanCalculatorProps {
  purchasePrice: number;
  expectedProfit: number;
}

const PROVIDERS = [
  { id: "nextgear", name: "NextGear Capital", apr: 10.75, floorFee: 55, auditFee: 15 },
  { id: "afc", name: "AFC (Automotive Finance Corp)", apr: 11.25, floorFee: 60, auditFee: 20 },
  { id: "westlake", name: "Westlake Flooring", apr: 12.0, floorFee: 50, auditFee: 15 },
  { id: "custom", name: "Custom Bank Line", apr: 8.5, floorFee: 0, auditFee: 0 },
];

export function FloorPlanCalculator({
  purchasePrice,
  expectedProfit,
}: FloorPlanCalculatorProps) {
  const [providerId, setProviderId] = useState("nextgear");
  const [holdingDays, setHoldingDays] = useState(30);

  const selectedProvider = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];
  const [customApr, setCustomApr] = useState(selectedProvider.apr);

  const activeApr = providerId === "custom" ? customApr : selectedProvider.apr;

  const calculations = useMemo(() => {
    const principal = purchasePrice || 0;
    const dailyRate = activeApr / 100 / 365;
    const dailyInterest = principal * dailyRate;
    const totalInterest = dailyInterest * holdingDays;

    // Curtailment fee after 45 days
    const curtailmentFee = holdingDays > 45 ? 65 : 0;
    const totalFees = selectedProvider.floorFee + selectedProvider.auditFee + curtailmentFee;

    const totalFinancingCost = totalInterest + totalFees;
    const netProfitAfterFloor = Math.round(expectedProfit - totalFinancingCost);

    // Days until profit hits zero
    const dailyBurn = dailyInterest;
    const daysToZero = dailyBurn > 0 ? Math.floor((expectedProfit - totalFees) / dailyBurn) : 999;

    // Projected profits at intervals
    const curve = [15, 30, 45, 60, 90].map((days) => {
      const interest = dailyInterest * days;
      const fees = selectedProvider.floorFee + selectedProvider.auditFee + (days > 45 ? 65 : 0);
      const remainingProfit = Math.round(expectedProfit - (interest + fees));
      return { days, remainingProfit, cost: Math.round(interest + fees) };
    });

    return {
      dailyInterest: Math.round(dailyInterest * 100) / 100,
      totalInterest: Math.round(totalInterest),
      totalFees,
      totalFinancingCost: Math.round(totalFinancingCost),
      netProfitAfterFloor,
      daysToZero: Math.max(0, daysToZero),
      curve,
    };
  }, [purchasePrice, expectedProfit, activeApr, holdingDays, selectedProvider]);

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--b2)] bg-[var(--s0)]/80 backdrop-blur-2xl p-6 sm:p-7"
      style={{
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full opacity-10 blur-[80px]"
        style={{ background: "var(--cyan)" }}
      />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--b1)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 text-white">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">
              Capital &amp; Float Economics
            </span>
            <h3 className="text-xl font-black text-[var(--t1)] tracking-tight">
              Floor Plan Financing &amp; Carry Cost Calculator
            </h3>
          </div>
        </div>

        {/* Provider Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProviderId(p.id);
                setCustomApr(p.apr);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                providerId === p.id
                  ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/25 scale-105"
                  : "bg-[var(--s1)] text-[var(--t3)] hover:text-[var(--t1)] border border-[var(--b1)]"
              }`}
            >
              {p.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 pt-5 space-y-6">
        {/* Holding Days Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-[var(--t3)] flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-cyan-400" />
              Target Inventory Turnaround Time:
            </span>
            <Mono className="text-base text-cyan-400 font-black">
              {holdingDays} Days
            </Mono>
          </div>
          <input
            type="range"
            min={7}
            max={90}
            step={1}
            value={holdingDays}
            onChange={(e) => setHoldingDays(Number(e.target.value))}
            className="w-full h-2 bg-[var(--s2)] rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] text-[var(--t4)] font-semibold">
            <span>7 Days (Fast Flip)</span>
            <span>30 Days (Average Turn)</span>
            <span>60 Days</span>
            <span>90 Days (Curtailment Risk)</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-panel p-3.5 rounded-2xl border border-[var(--b1)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
              Daily Carry Cost
            </div>
            <Mono className="text-lg font-bold text-cyan-400 mt-0.5">
              ${calculations.dailyInterest.toFixed(2)} / day
            </Mono>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-[var(--b1)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
              Total Interest &amp; Fees
            </div>
            <Mono className="text-lg font-bold text-[var(--t2)] mt-0.5">
              ${calculations.totalFinancingCost.toLocaleString()}
            </Mono>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-[var(--b1)] bg-emerald-500/5 border-emerald-500/20">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Net Profit After Float
            </div>
            <Mono className="text-lg font-black text-emerald-400 mt-0.5">
              +${calculations.netProfitAfterFloor.toLocaleString()}
            </Mono>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-[var(--b1)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
              Break-Even Ceiling
            </div>
            <Mono className="text-lg font-bold text-amber-400 mt-0.5">
              {calculations.daysToZero} Days
            </Mono>
          </div>
        </div>

        {/* Profit Degradation Schedule */}
        <div className="rounded-2xl bg-[var(--s1)] border border-[var(--b1)] p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--t4)] flex items-center justify-between">
            <span>Profit Degradation by Turn Day</span>
            <span className="text-[10px] lowercase text-[var(--t5)]">
              ({activeApr}% APR · {selectedProvider.name})
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center">
            {calculations.curve.map((point) => (
              <div
                key={point.days}
                className={`p-2.5 rounded-xl border ${
                  holdingDays >= point.days - 5 && holdingDays <= point.days + 5
                    ? "bg-cyan-500/10 border-cyan-500/30"
                    : "bg-[var(--s2)] border-[var(--b1)]"
                }`}
              >
                <div className="text-[10px] font-bold text-[var(--t4)]">
                  {point.days} Days
                </div>
                <Mono
                  className={`text-xs sm:text-sm font-black mt-1 block ${
                    point.remainingProfit > 0 ? "text-emerald-400" : "text-[var(--red)]"
                  }`}
                >
                  ${point.remainingProfit.toLocaleString()}
                </Mono>
                <div className="text-[9px] text-[var(--t5)] mt-0.5">
                  -${point.cost} carry
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
