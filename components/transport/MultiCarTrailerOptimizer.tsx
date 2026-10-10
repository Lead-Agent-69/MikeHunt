"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Truck,
  Sparkles,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Package,
  Layers,
  CheckCircle,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

interface MultiCarProps {
  miles: number;
  fromState: string;
  toState: string;
}

const TRAILER_CONFIGS = [
  {
    cars: 1,
    name: "Single-Car Hotshot",
    discountPct: 0,
    ratePerMile: 0.95,
    baseFee: 150,
    eta: "2-4 days",
  },
  {
    cars: 3,
    name: "3-Car Wedge Trailer",
    discountPct: 18,
    ratePerMile: 0.78,
    baseFee: 120,
    eta: "3-5 days",
    badge: "Popular for Auctions",
  },
  {
    cars: 5,
    name: "5-Car Quick-Haul",
    discountPct: 32,
    ratePerMile: 0.65,
    baseFee: 95,
    eta: "4-6 days",
  },
  {
    cars: 9,
    name: "9-Car Full Semi Transport",
    discountPct: 48,
    ratePerMile: 0.49,
    baseFee: 75,
    eta: "5-7 days",
    badge: "Maximum Profit Margin",
  },
];

export function MultiCarTrailerOptimizer({
  miles = 750,
  fromState = "TX",
  toState = "FL",
}: MultiCarProps) {
  const [selectedCars, setSelectedCars] = useState(3);

  const baseSingleCost = Math.round(miles * 0.95 + 150);

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--b2)] bg-[var(--s0)]/80 backdrop-blur-2xl p-6 sm:p-7"
      style={{
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Background neon glow */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-15 blur-[80px]"
        style={{ background: "var(--amber)" }}
      />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--b1)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 text-white">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">
              Corridor Logistics Arbitrage
            </span>
            <h3 className="text-xl font-black text-[var(--t1)] tracking-tight">
              Multi-Car Trailer Bundle Optimizer
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-400">
          <Sparkles className="h-3.5 w-3.5" />
          Save up to 48% on freight
        </div>
      </div>

      <div className="relative z-10 pt-5 space-y-5">
        <p className="text-xs text-[var(--t3)] leading-relaxed">
          Hauling vehicles one at a time costs more per unit. Bundle 3 to 9 vehicles on a wedge or 9-car hauler along the{" "}
          <strong className="text-[var(--t1)]">{fromState} ➔ {toState}</strong> corridor ({miles.toLocaleString()} miles) to maximize your net margin per unit.
        </p>

        {/* Trailer Options Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {TRAILER_CONFIGS.map((tier) => {
            const costPerCar = Math.round(miles * tier.ratePerMile + tier.baseFee);
            const totalCost = costPerCar * tier.cars;
            const singleTotal = baseSingleCost * tier.cars;
            const totalSaved = Math.max(0, singleTotal - totalCost);
            const isSelected = selectedCars === tier.cars;

            return (
              <div
                key={tier.cars}
                onClick={() => setSelectedCars(tier.cars)}
                className={`relative p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/10 scale-[1.02]"
                    : "bg-[var(--s1)] border-[var(--b1)] hover:border-[var(--b2)]"
                }`}
              >
                {tier.badge && (
                  <span className="absolute -top-2.5 right-3 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-black shadow-sm">
                    {tier.badge}
                  </span>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[var(--t1)]">
                      {tier.cars} {tier.cars === 1 ? "Vehicle" : "Vehicles"}
                    </span>
                    {tier.discountPct > 0 && (
                      <span className="text-[10px] font-black text-emerald-400">
                        -{tier.discountPct}%
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--t4)] font-medium">
                    {tier.name}
                  </div>

                  <div className="pt-2">
                    <div className="text-[10px] uppercase font-bold text-[var(--t4)]">
                      Cost Per Unit
                    </div>
                    <Mono className="text-xl font-black text-[var(--t1)]">
                      ${costPerCar.toLocaleString()}
                    </Mono>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-[var(--b1)]">
                  {tier.cars > 1 ? (
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                      <span>Total Savings:</span>
                      <Mono>+${totalSaved.toLocaleString()}</Mono>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[var(--t4)]">
                      Baseline single hauler rate
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Bundle Summary Callout */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[var(--s1)] to-[var(--s0)] border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Profit Impact Summary for {selectedCars}-Car Load
            </div>
            <p className="text-xs text-[var(--t2)] mt-0.5">
              By loading {selectedCars} cars along this corridor, you add an average of{" "}
              <strong className="text-emerald-400">
                +${Math.round(baseSingleCost - (miles * (TRAILER_CONFIGS.find(t => t.cars === selectedCars)?.ratePerMile ?? 0.95) + (TRAILER_CONFIGS.find(t => t.cars === selectedCars)?.baseFee ?? 150))).toLocaleString()}
              </strong>{" "}
              clean profit to every single car flipped.
            </p>
          </div>

          <a
            href={`/scan?state=${fromState}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-black bg-gradient-to-r from-amber-400 to-orange-500 hover:scale-105 active:scale-95 transition-all shrink-0 shadow-md"
          >
            Find Deals in {fromState}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
