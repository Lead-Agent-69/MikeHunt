"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BorderBeam, ShineBorder, GradientText } from "@/components/ui/premium-visuals";
import { LiquidMetalButton, LiquidGlassButton } from "@/components/ui/framer-components";

export interface BestBuyDeal {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  askPrice: number;
  mmrValue: number;
  profitEstimate: number;
  profitScore: number;
  locationCity?: string;
  locationState?: string;
  vin?: string;
  source: string;
  repairEstimate?: number;
}

export function NextBestBuyHero({
  deal,
  onOpenSimulator,
  onOpenCopilot,
}: {
  deal?: BestBuyDeal;
  onOpenSimulator?: (deal: BestBuyDeal) => void;
  onOpenCopilot?: (deal: BestBuyDeal) => void;
}) {
  const [claimed, setClaimed] = useState(false);

  // Fallback demo deal if no deal passed
  const topDeal: BestBuyDeal = deal || {
    id: "best-1",
    year: 2021,
    make: "BMW",
    model: "M3 Competition",
    trim: "xDrive Sedan",
    askPrice: 58500,
    mmrValue: 71200,
    profitEstimate: 8400,
    profitScore: 96,
    locationCity: "Dallas",
    locationState: "TX",
    vin: "WBS83AY05M12****",
    source: "Manheim Auction",
    repairEstimate: 850,
  };

  const roi = (((topDeal.profitEstimate) / topDeal.askPrice) * 100).toFixed(1);

  return (
    <div className="relative w-full mb-8">
      <div
        className="relative rounded-3xl border border-[var(--amber-bd)] bg-[var(--s0)] p-6 sm:p-8 overflow-hidden shadow-2xl backdrop-blur-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(20, 18, 25, 0.95), rgba(12, 10, 16, 0.98))",
          boxShadow: "0 0 40px rgba(242, 91, 154, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        }}
      >
        <BorderBeam duration={5} size={140} colorFrom="#00ff66" colorTo="#ff7a4d" />

        {/* Ambient Glow */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[120px] opacity-25"
          style={{ background: "radial-gradient(circle, #00ff66 0%, transparent 70%)" }}
          aria-hidden
        />

        {/* Header Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 relative z-10">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-[var(--amber-bd)] bg-[var(--amber-lo)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ff66] animate-ping" />
            <span className="text-xs font-black uppercase tracking-wider text-[var(--amber-d)] font-mono">
              🔥 NEXT BEST BUY OPTION · ALGORITHM MATCH #1
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs text-[var(--t4)]">
            <span className="flex items-center gap-1 text-[#00ff66]">
              <span className="w-2 h-2 rounded-full bg-[#00ff66]" /> Live Sourced
            </span>
            <span>·</span>
            <span>Source: <strong className="text-[var(--t1)]">{topDeal.source}</strong></span>
          </div>
        </div>

        {/* Main Deal Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
          {/* Left: Vehicle Title & Specs */}
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-black font-mono px-3 py-1 rounded-full bg-[#00ff66]/15 text-[#00ff66] border border-[#00ff66]/30">
                DEAL IQ {topDeal.profitScore}/100
              </span>
              <span className="text-xs text-[var(--t4)] font-mono">
                {topDeal.locationCity}, {topDeal.locationState}
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-[var(--t1)] tracking-tight mb-2">
              {topDeal.year} {topDeal.make} {topDeal.model}{" "}
              {topDeal.trim && <span className="text-[var(--t3)] font-medium text-2xl">{topDeal.trim}</span>}
            </h2>

            <p className="text-sm font-mono text-[var(--t4)] mb-6">
              VIN: <span className="text-[var(--t2)]">{topDeal.vin}</span>
            </p>

            {/* Price Metrics Strip */}
            <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)]/80 backdrop-blur-md font-mono">
              <div>
                <span className="text-[11px] text-[var(--t4)] uppercase block">Asking Price</span>
                <span className="text-xl font-bold text-[var(--t1)]">${topDeal.askPrice.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[11px] text-[var(--t4)] uppercase block">Market MMR</span>
                <span className="text-xl font-bold text-[var(--t2)]">${topDeal.mmrValue.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[11px] text-[var(--t4)] uppercase block">Est Recon</span>
                <span className="text-xl font-bold text-[var(--t3)]">${(topDeal.repairEstimate || 850).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Right: Big Profit Gauge & Actions */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-end text-center lg:text-right border-t lg:border-t-0 lg:border-l border-[var(--b2)] pt-6 lg:pt-0 lg:pl-8">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--t4)] mb-1">
              Max Profit Opportunity
            </span>
            <div className="text-5xl sm:text-6xl font-black font-mono text-[#00ff66] tracking-tight mb-1">
              +${topDeal.profitEstimate.toLocaleString()}
            </div>
            <div className="text-sm font-mono text-[var(--t3)] mb-6">
              Net ROI: <span className="font-bold text-[#00ff66]">{roi}%</span> · Turn Est: <span className="text-[var(--t1)]">14 Days</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-3 w-full">
              <LiquidMetalButton onClick={() => setClaimed(true)}>
                <span>{claimed ? "✅ SNIPE QUEUED" : "⚡ EXECUTE BEST BUY"}</span>
              </LiquidMetalButton>

              {onOpenSimulator && (
                <button
                  onClick={() => onOpenSimulator(topDeal)}
                  className="px-4 py-3 rounded-xl border border-[var(--b2)] bg-[var(--s1)] text-xs font-bold text-[var(--t2)] hover:text-[var(--t1)] hover:border-[var(--amber-bd)] transition-all"
                >
                  🧮 Profit Lab
                </button>
              )}

              {onOpenCopilot && (
                <button
                  onClick={() => onOpenCopilot(topDeal)}
                  className="px-4 py-3 rounded-xl border border-[var(--b2)] bg-[var(--s1)] text-xs font-bold text-[var(--t2)] hover:text-[var(--t1)] hover:border-[var(--purple-d)] transition-all"
                >
                  🤖 AI Outreach
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
